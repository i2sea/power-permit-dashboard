"""Polite fetcher for the KOREC (전기위원회) site: small pages, pauses, a few retries."""
import json, subprocess, sys, time, urllib.parse

BASE = 'https://www.korec.go.kr'


def get(path, params=None, out=None, accept=None, tries=4, pause=3):
    url = BASE + path + ('?' + urllib.parse.urlencode(params) if params else '')
    for i in range(tries):
        cmd = ['curl', '-sS', '--max-time', '90', '-b', 'ck.txt', '-c', 'ck.txt', '-o', out or '-', '-w', '%{http_code} %{size_download} %{content_type}', url]
        if accept:
            cmd[1:1] = ['-H', f'Accept: {accept}']
        r = subprocess.run(cmd, capture_output=True)
        meta = r.stdout.decode('utf-8', 'replace') if out else r.stdout.decode('utf-8', 'replace')[-120:]
        code = (meta.split() or ['000'])[0] if out else meta.rsplit(' ', 2)[0][-3:]
        if r.returncode == 0:
            return r.stdout if not out else meta
        sys.stderr.write(f'retry {i + 1} {path}: {r.stderr.decode().strip()}\n')
        time.sleep(pause * (i + 1))
    raise RuntimeError('failed: ' + url)


def board(bbs_se=None, per=100):
    rows, page = [], 1
    while True:
        params = {'pageIndex': page, 'recordCountPerPage': per}
        if bbs_se is not None:
            params['bbsSe'] = bbs_se
        raw = get('/notice/selectNoticeList.do', params)
        body = raw[: raw.rfind(b'}') + 1]
        d = json.loads(body)
        rows += d['resultList']
        if page >= d['paginationInfo']['totalPageCount']:
            return rows, d['paginationInfo']['totalRecordCount']
        page += 1
        time.sleep(2)


if __name__ == '__main__':
    what = sys.argv[1]
    if what == 'boards':
        for name, se in (('notice', None), ('result', 2)):
            rows, total = board(se)
            # notices pinned on top repeat on every page: de-duplicate by post number
            uniq = list({r['bbsSntncNo']: r for r in rows}.values())
            json.dump(uniq, open(f'raw/{name}_all.json', 'w', encoding='utf-8'), ensure_ascii=False)
            print(name, 'rows', len(uniq), 'total', total)
            time.sleep(2)


def download(flpth, name, out, tries=4):
    """Attachments are served to a POST like the site's download form, as a document."""
    q = urllib.parse.urlencode({'attachingFilePath': flpth, 'attachingFileNm': name})
    for i in range(tries):
        r = subprocess.run(['curl', '-sS', '--max-time', '180', '-b', 'ck.txt', '-X', 'POST', '-d', '',
                            '-H', 'Accept: text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
                            BASE + '/commonfile/fileDownLoad.do?' + q, '-o', out, '-w', '%{http_code} %{content_type}'],
                           capture_output=True)
        meta = r.stdout.decode()
        if r.returncode == 0 and meta.startswith('200') and 'json' not in meta:
            return meta
        sys.stderr.write(f'retry {i + 1} {name}: {r.stderr.decode().strip()} {meta}\n')
        time.sleep(5 * (i + 1))
    raise RuntimeError('download failed: ' + name)
