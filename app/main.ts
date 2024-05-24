import * as fs from 'fs';
import zlib from 'zlib';
import crypto from 'crypto';

const args = process.argv.slice(2);
const command = args[0];

enum Commands {
    Init = "init",
    CatFile = "cat-file",
    HashObject = "hash-object"
}

switch (command) {
    case Commands.Init:
        fs.mkdirSync(".git", { recursive: true });
        fs.mkdirSync(".git/objects", { recursive: true });
        fs.mkdirSync(".git/refs", { recursive: true });
        fs.writeFileSync(".git/HEAD", "ref: refs/heads/main\n");
        console.log("Initialized git directory");
        break;
    case Commands.CatFile:
        const blobDir = args[2].substring(0, 2);
        const blobFile = args[2].substring(2);
        const blob = fs.readFileSync(`.git/objects/${blobDir}/${blobFile}`);
        const decompressedBuffer = zlib.unzipSync(blob);
        const nullByteIndex = decompressedBuffer.indexOf(0);
        const blobContent = decompressedBuffer.subarray(nullByteIndex + 1).toString();
        process.stdout.write(blobContent);
        break;
    case Commands.HashObject:
        const flag = args[1];
        let path = args[2];
        if (flag !== "-w") path = flag;
        const data = fs.readFileSync(path);
        const header = `blob ${data.length}\0`;
        const sha = crypto.createHash("sha1").update(header + data).digest("hex");
        if (flag === "-w") {
            const dir = sha.substring(0, 2);
            const file = sha.substring(2);
            const compressedData = zlib.deflateSync(data);
            fs.mkdirSync(`.git/objects/${dir}`, { recursive: true });
            fs.writeFileSync(`.git/objects/${dir}/${file}`, compressedData);
        }
        process.stdout.write(sha);
        break;
    default:
        throw new Error(`Unknown command ${command}`);
}
