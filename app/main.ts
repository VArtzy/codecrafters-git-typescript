import * as fs from 'fs';
import zlib from 'zlib';

const args = process.argv.slice(2);
const command = args[0];

enum Commands {
    Init = "init",
    Catfile = "cat-file"
}

switch (command) {
    case Commands.Init:
        fs.mkdirSync(".git", { recursive: true });
        fs.mkdirSync(".git/objects", { recursive: true });
        fs.mkdirSync(".git/refs", { recursive: true });
        fs.writeFileSync(".git/HEAD", "ref: refs/heads/main\n");
        console.log("Initialized git directory");
        break;
    case Commands.Catfile:
        const blobDir = args[2].substring(0, 2);
        const blobFile = args[2].substring(2);
        const blob = fs.readFileSync(`.git/objects/${blobDir}/${blobFile}`);
        const decompressedBuffer = zlib.unzipSync(blob);
        const nullByteIndex = decompressedBuffer.indexOf(0);
        const blobContent = decompressedBuffer.subarray(nullByteIndex + 1).toString();
        console.log(blobContent);
        break;
    default:
        throw new Error(`Unknown command ${command}`);
}
