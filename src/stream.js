export function streamToPromise(stream) {
   return new Promise((resolve, reject) => {
   stream.on('finish', resolve);
   stream.on('error', reject);
   });
}
