import {expect,it} from 'vitest';
import {messageDocument} from './message-document';
it('promotes safe sender background and preserves table formatting',()=>{
 const doc=new DOMParser().parseFromString(messageDocument('<div data-lxp-email-html style="color:#123456"><div data-lxp-email-body style="background-color:#f0dabc"><table cellspacing="4"><tr><td style="padding:20px">Mail</td></tr></table></div></div>'),'text/html');
 expect(doc.body.style.backgroundColor).toBe('#f0dabc');expect(doc.body.style.color).toBe('#123456');expect(doc.querySelector('td')?.style.padding).toBe('20px');expect(doc.querySelector('table')?.getAttribute('cellspacing')).toBe('4');
});
it('uses an independent light document without forcing the panel theme',()=>{
 const html=messageDocument('<p style="color:red">Mail</p>');expect(html).toContain('color-scheme:light');expect(html).not.toContain('!important');expect(html).toContain('color:red');
});
