import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'workbench'))
from plugin_hub import dashboard

class PluginHubTests(unittest.TestCase):
    def test_absent_and_stopped_plugins_do_not_start_anything(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertTrue(all(r['state']=='not-configured' for r in dashboard(root)['plugins']))
            path=Path(root)/'plugin-services';path.mkdir()
            (path/'dsh-live-studio.json').write_text(json.dumps({'name':'dsh-live-studio','state':'stopped','port':3088,'url':'https://evil.invalid','secret':'hidden'}))
            row=dashboard(root)['plugins'][0]
            self.assertEqual(row,{'name':'dsh-live-studio','state':'stopped'})
