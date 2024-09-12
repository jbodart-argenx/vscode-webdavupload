class Headers {
   constructor(init = {}) {
     this.headers = {};
 
     // If initial headers are provided (either an object or a map), initialize them
     if (init instanceof Headers) {
       init.forEach((value, key) => {
         this.append(key, value);
       });
     } else if (typeof init === 'object') {
       Object.keys(init).forEach((key) => {
         this.append(key, init[key]);
       });
     }
   }
 
   append(key, value) {
     key = key.toLowerCase();
     if (!this.headers[key]) {
       this.headers[key] = [];
     }
     this.headers[key].push(value);
   }
 
   get(key) {
     key = key.toLowerCase();
     return this.headers[key] ? this.headers[key].join(', ') : null;
   }
 
   set(key, value) {
     key = key.toLowerCase();
     this.headers[key] = [value];
   }
 
   has(key) {
     key = key.toLowerCase();
     return !!this.headers[key];
   }
 
   delete(key) {
     key = key.toLowerCase();
     delete this.headers[key];
   }
 
   forEach(callback) {
     Object.keys(this.headers).forEach((key) => {
       callback(this.headers[key].join(', '), key);
     });
   }
 
   toObject() {
     const obj = {};
     this.forEach((value, key) => {
       obj[key] = value;
     });
     return obj;
   }
 }
 
 module.exports = Headers;
 