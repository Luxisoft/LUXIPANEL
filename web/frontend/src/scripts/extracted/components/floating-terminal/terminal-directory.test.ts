import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('@xterm/xterm',()=>({Terminal:class {cols=80;rows=24;loadAddon(){}open(){}onData(){}write(){}focus(){}}}));
vi.mock('@xterm/addon-fit',()=>({FitAddon:class {fit(){}}}));
vi.mock('@xterm/addon-web-links',()=>({WebLinksAddon:class {}}));
vi.mock('./tabs',()=>({getTabAccentClass:()=>''}));
vi.mock('./theme',()=>({getTerminalTheme:()=>({})}));
vi.mock('./startup',()=>({getModeInitialCommand:()=>null}));
vi.mock('./terminal-scroll',()=>({containTerminalScroll:()=>{}}));
vi.mock('./terminal-io',()=>({getWebsocketToken:vi.fn(async()=>''),normalizePath:(p:string)=>p,setStatus:()=>{},emitTerminalCwd:()=>{},processTerminalInput:()=>{},applyMobileKeyModifiersToTyped:(s:string)=>s}));
vi.mock('@/lib/api-client',()=>({BRIDGE_SESSION_SESSION_KEY:'bridge',TARGET_SCOPE_SESSION_KEY:'scope',SERVER_SWITCHER_ID:'servers',ATTR_CURRENT_BRIDGE_SESSION_ID:'data-bridge'}));
import {sessions,S} from './state';
import {createTerminal} from './terminal';
import {getWebsocketToken} from './terminal-io';
class Socket extends EventTarget {
 static OPEN=1;static all:Socket[]=[];
 readyState=1;sent:string[]=[];
 onmessage:((e:{data:string})=>void)|null=null;
 onclose:((e:{reason:string})=>void)|null=null;
 send(data:string){this.sent.push(data);}
 constructor(_url:string){super();Socket.all.push(this);}
 connected(reattached=false){this.onmessage?.({data:JSON.stringify({type:'connected',pid:1,reattached})});}
 inputs(){return this.sent.map(s=>JSON.parse(s)).filter(s=>s.type==='input').map(s=>s.data);}
}
beforeEach(()=>{
 vi.mocked(getWebsocketToken).mockResolvedValue('');
 vi.useFakeTimers();vi.stubGlobal('WebSocket',Socket);Socket.all=[];sessions.clear();S.activeTabId=1;
 sessionStorage.clear();localStorage.clear();document.body.innerHTML='<div><div id="terminal-container"></div></div>';
 (window as any).__filesCurrentPath='/var/www/active-files-folder';
 sessionStorage.setItem('files:currentPath','/var/www/stale-files-folder');
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();sessions.clear();delete (window as any).__filesCurrentPath;sessionStorage.clear();localStorage.clear();document.body.replaceChildren();});
it.each(['memory','storage'])('lets the server choose the directory despite a Files folder in %s',async(source)=>{
 if(source==='storage')delete (window as any).__filesCurrentPath;
 createTerminal(1);await Promise.resolve();const ws=Socket.all[0];ws.connected();
 expect(ws.inputs()).toEqual([]);expect(sessions.get(1)?.cdOnConnect).toBeNull();expect(sessions.get(1)?.cwd).toBe('');
});
it('still honors an explicitly requested directory',async()=>{
 createTerminal(1,{cdOnConnect:'/explicit/project'});await Promise.resolve();const ws=Socket.all[0];ws.connected();
 expect(ws.inputs()).toEqual(['cd "/explicit/project"\r']);
});
it('reconnects using only the terminal session directory, never Files',async()=>{
 createTerminal(1);await Promise.resolve();Socket.all[0].connected();
 Socket.all[0].onclose?.({reason:'transport-lost'});await vi.advanceTimersByTimeAsync(1500);Socket.all[1].connected();
 expect(Socket.all[1].inputs()).toEqual([]);
 sessions.get(1)!.cwd='/terminal/own-directory';
 Socket.all[1].onclose?.({reason:'transport-lost'});await vi.advanceTimersByTimeAsync(3000);Socket.all[2].connected();
 expect(Socket.all[2].inputs()).toEqual(['cd "/terminal/own-directory"\r']);
});
it('does not change directory when reattaching an existing tmux session',async()=>{
 createTerminal(1,{cdOnConnect:'/explicit/project'});await Promise.resolve();Socket.all[0].connected(true);
 expect(Socket.all[0].inputs()).toEqual([]);
});

it('shows loading until the PTY is ready, then stops covering the console',async()=>{
 createTerminal(1);expect(document.getElementById('terminal-container')?.getAttribute('aria-busy')).toBe('true');
 await Promise.resolve();expect(document.getElementById('lxp-terminal-loading')?.style.display).toBe('flex');
 Socket.all[0].connected();expect(document.getElementById('lxp-terminal-loading')?.style.display).toBe('none');
 expect(document.getElementById('terminal-container')?.getAttribute('aria-busy')).toBe('false');
 Socket.all[0].onclose?.({reason:'transport-lost'});expect(document.getElementById('lxp-terminal-loading')?.style.display).toBe('flex');
 await vi.advanceTimersByTimeAsync(1500);Socket.all[1].connected(true);
 expect(document.getElementById('lxp-terminal-loading')?.style.display).toBe('none');
});
it('clears the spinner when authentication fails before a socket exists',async()=>{
 vi.mocked(getWebsocketToken).mockRejectedValueOnce(new Error('Unavailable'));
 createTerminal(1);await Promise.resolve();
 expect(document.getElementById('lxp-terminal-loading')?.style.display).toBe('none');
});
it('clears the spinner on a server connection error',async()=>{
 createTerminal(1);await Promise.resolve();Socket.all[0].onmessage?.({data:JSON.stringify({type:'error',message:'Connection failed'})});
 expect(document.getElementById('lxp-terminal-loading')?.style.display).toBe('none');
});

it('keeps loading during CLI bootstrap and stops on its ready marker',async()=>{
 createTerminal(1,{initialCommand:'opencode'});await Promise.resolve();Socket.all[0].connected();
 expect(document.getElementById('lxp-terminal-loading')?.style.display).toBe('flex');
 Socket.all[0].onmessage?.({data:JSON.stringify({type:'output',data:'\u001b]LXP-TUI-READY\u0007'})});
 expect(document.getElementById('lxp-terminal-loading')?.style.display).toBe('none');
});
it('does not leave a spinner behind when socket creation fails',async()=>{
 vi.stubGlobal('WebSocket',class {static OPEN=1;constructor(){throw new Error('Unavailable');}});
 createTerminal(1);await Promise.resolve();
 expect(document.getElementById('lxp-terminal-loading')?.style.display).toBe('none');
});
