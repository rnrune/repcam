// Dropbox content_hash of a local file: SHA-256 over the concatenated SHA-256 digests of each 4 MiB block.
const fs = require('fs'), crypto = require('crypto');
function dropboxHash(file) {
  const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(4 * 1024 * 1024), outer = crypto.createHash('sha256');
  try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) outer.update(crypto.createHash('sha256').update(buf.subarray(0, n)).digest()); }
  finally { fs.closeSync(fd); }
  return outer.digest('hex');
}
module.exports = { dropboxHash };
if (require.main === module) console.log(dropboxHash(process.argv[2]));
