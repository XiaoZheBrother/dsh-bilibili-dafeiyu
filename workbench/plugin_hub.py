"""Read-only optional plugin discovery. Never starts a worker or imports its state."""
import json
from pathlib import Path
from urllib.request import build_opener, ProxyHandler, HTTPRedirectHandler

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Redirect rejected')

NAMES = ('dsh-live-studio', 'dsh-game-agent')

def dashboard(home):
    rows=[]
    for name in NAMES:
        row={'name':name,'state':'not-configured'}
        path=Path(home)/'plugin-services'/(name+'.json')
        try:
            if path.is_symlink() or path.stat().st_size>4096: raise ValueError('Invalid descriptor')
            doc=json.loads(path.read_text(encoding='utf8'))
            port=doc.get('port')
            if type(port) is not int or not 1024<=port<=65535 or doc.get('name')!=name:raise ValueError('Invalid descriptor')
            row['state']='stopped'
            if doc.get('state') in ('running','starting'):
                url=f'http://127.0.0.1:{port}'
                opener=build_opener(ProxyHandler({}), NoRedirect())
                with opener.open(url+'/api/service',timeout=.5) as response:
                    if response.geturl()!=url+'/api/service':raise ValueError('Redirect rejected')
                    identity=json.loads(response.read(4097))
                if identity.get('name')!=name:raise ValueError('Different service')
                row.update(state='running',url=url,preview=url+'/?view=stream&audio=direct'+('&layout=game' if name=='dsh-game-agent' else ''),version=identity.get('version'))
        except FileNotFoundError:pass
        except (OSError,ValueError,TypeError):row['state']='unavailable'
        rows.append(row)
    return {'plugins':rows}
