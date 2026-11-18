import {expect,it} from 'vitest';
import {isProtectedFolder,buildFolderTree} from './helpers';
it.each(['Cuarentena','Junk','spam','Quarantine','Revisar-IA'])('protects %s without losing nested folders',name=>{
 expect(isProtectedFolder({path:'INBOX.'+name,name,delimiter:'.'})).toBe(true);
});
it('protects parents and server-defined folders without protecting ordinary children',()=>{
 const folders=[{path:'Personal',name:'Personal',delimiter:'/'},{path:'Personal/Junk',name:'Junk'}];
 expect(isProtectedFolder(folders[0],folders)).toBe(true);
 expect(isProtectedFolder({path:'Odd',name:'Odd',protected:true})).toBe(true);
 expect(isProtectedFolder({path:'Junk/Receipts',name:'Receipts'})).toBe(false);
 expect(buildFolderTree(folders).roots).toHaveLength(1);
});
it('orders navigation by purpose independently of protection',()=>{
 const folders=['Cuarentena','Junk','Spam','Trash','Work','Sent','INBOX','Drafts','Archive','Alpha'].map(name=>({path:name,name,protected:true}));
 expect(buildFolderTree(folders).roots.map(n=>n.path)).toEqual(['INBOX','Drafts','Sent','Archive','Alpha','Work','Trash','Junk','Spam','Cuarentena']);
});
it('uses IMAP roles and sorts siblings without flattening namespaces',()=>{
 const folders=[{path:'Inbox.Spam',name:'Spam',delimiter:'.'},{path:'Inbox.Zebra',name:'Zebra',delimiter:'.'},{path:'Inbox',name:'Entrada',specialUse:'\\Inbox',delimiter:'.'},{path:'Inbox.Cuarentena',name:'Cuarentena',delimiter:'.'}];
 const tree=buildFolderTree(folders);expect(tree.roots).toHaveLength(1);expect(tree.roots[0].children.map(n=>n.label)).toEqual(['Zebra','Spam','Cuarentena']);
});
