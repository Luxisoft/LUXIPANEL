// @vitest-environment happy-dom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createMoveDialog} from './move-dialog';
let dialog:HTMLDialogElement;
beforeEach(()=>{
 document.body.innerHTML='<dialog id="dlg-move"><div id="move-account"></div><div id="move-subject"></div><div id="move-origin"></div><input id="move-search"><div id="move-error" hidden></div><div id="move-folders-list"></div><button id="move-close"></button><button id="move-cancel"></button><button id="move-confirm"></button></dialog>';
 dialog=document.querySelector('dialog')!;
 Object.defineProperty(document,'hidden',{configurable:true,value:false});
 dialog.showModal=()=>dialog.setAttribute('open',''); dialog.close=()=>{dialog.removeAttribute('open');dialog.dispatchEvent(new Event('close'));};
});
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();});
const button=(id:string)=>document.getElementById(id) as HTMLButtonElement;
function setup(move=vi.fn().mockResolvedValue({ok:true})){
 const success=vi.fn();const controller=createMoveDialog(document,{folders:()=>[{path:'INBOX',name:'Inbox'},{path:'Sent',name:'Sent',protected:true},{path:'Group',name:'Group',flags:['\\Noselect']}],currentFolder:()=> 'INBOX',copy:key=>key,move,success});
 controller.open({uid:7,folder:'INBOX',subject:'A message',account:'account@test'});return{controller,move,success};
}
it('selects without posting and cancels without changing the mailbox',()=>{
 const {move}=setup();expect(button('move-confirm').disabled).toBe(true);
 expect(document.querySelectorAll('[role=radio]')).toHaveLength(2);
 (document.querySelector('[role=radio]') as HTMLButtonElement).click();
 expect(button('move-confirm').disabled).toBe(false);expect(move).not.toHaveBeenCalled();
 button('move-cancel').click();expect(dialog.open).toBe(false);expect(move).not.toHaveBeenCalled();
});
it('preserves destination on failure and sends the captured identity once per confirmation',async()=>{
 const move=vi.fn().mockResolvedValueOnce({ok:false,error:'Failure'}).mockResolvedValueOnce({ok:true});const {success}=setup(move);
 (document.querySelector('[role=radio]') as HTMLButtonElement).click();button('move-confirm').click();button('move-confirm').click();
 await vi.waitFor(()=>expect(button('move-error').textContent).toBe('Failure'));
 expect(dialog.open).toBe(true);expect(move).toHaveBeenCalledTimes(1);expect(document.querySelector('[aria-checked=true]')).toBeTruthy();
 button('move-confirm').click();await vi.waitFor(()=>expect(success).toHaveBeenCalledTimes(1));
 expect(move).toHaveBeenLastCalledWith({uid:7,folder:'INBOX',subject:'A message',account:'account@test'},'Sent');
});
it('ignores a pending result after the mailbox loses visibility',async()=>{
 let finish:(value:{ok:boolean})=>void=()=>{};const move=vi.fn(()=>new Promise<{ok:boolean}>(resolve=>finish=resolve));const{success}=setup(move);
 (document.querySelector('[role=radio]') as HTMLButtonElement).click();button('move-confirm').click();
 Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));finish({ok:true});
 await Promise.resolve();expect(success).not.toHaveBeenCalled();expect(dialog.open).toBe(false);
});
