/* 
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/ClientSide/javascript.js to edit this template
 */

class UUID {
    static random() {
        return crypto?.randomUUID?.() ?? 
               'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                   const r = Math.random() * 16 | 0;
                   return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
               });
    }
}
