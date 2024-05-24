import * as fs from 'fs';
import zlib from 'zlib';
import crypto from 'crypto';

const args = process.argv.slice(2);
const command = args[0];

enum Commands {
    Init = "init",
    CatFile = "cat-file",
    HashObject = "hash-object",
    WriteTree = "write-tree",
    LsTree = "ls-tree",
    CommitTree = "commit-tree",
}

type Tree = {
    mode: string;
    name: string;
    type: string;
    sha: string;
}

function sortBy(array: any[], key: string): any[] {
    return array.sort((a, b) => {
        if (a[key] < b[key]) return -1;
        if (a[key] > b[key]) return 1;
        return 0;
    });
}

function writeToBlob(path: string, w: boolean = false): string {
    const data = fs.readFileSync(path);
    const header = `blob ${data.length}\0`;
    const sha = crypto.createHash("sha1").update(header + data).digest("hex");

    if (w) {
    const dir = sha.substring(0, 2);
    const file = sha.substring(2);
    const compressedData = zlib.deflateSync(data);
    fs.mkdirSync(`.git/objects/${dir}`, { recursive: true });
    fs.writeFileSync(`.git/objects/${dir}/${file}`, compressedData);
    }

    return sha;
}

function writeTree(path: string): string {
        const objs = fs.readdirSync(path).filter((v: string) => v !== ".git");
        const trees: Tree[] = [];
        for (const v of objs) {
            const fullPath = `${path}/${v}`;
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) {
                trees.push({
                    mode: "100644",
                    name: v,
                    type: "blob",
                    sha: writeToBlob(fullPath, true)
                })
            }
            if (stat.isDirectory()) {
                trees.push({
                    mode: "40000",
                    name: v,
                    type: "tree",
                    sha: writeTree(fullPath)
                })
            }
        }

        const contents = sortBy(trees, 'name').reduce((acc, { mode, name, sha }) => {
            return Buffer.concat([
                acc,
                Buffer.from(`${mode} ${name}\0`),
                Buffer.from(sha, 'hex'),
            ]);
        }, Buffer.alloc(0));

        const treeContents = Buffer.concat([
            Buffer.from(`tree ${contents.length}\x00`),
            contents
        ]);

        const treeHash = crypto.createHash('sha1').update(treeContents).digest('hex');
        const dir = treeHash.substring(0, 2);

        fs.mkdirSync(`.git/objects/${dir}`, { recursive: true });
        fs.writeFileSync(`.git/objects/${dir}/${treeHash.substring(2)}`, zlib.deflateSync(treeContents));

        return treeHash;
}

function readTree(args: string[]) {
    const flag = args[1];
    let sha = args[2];
    if (flag !== "--name-only") sha = flag;
    const path = `.git/objects/${sha.substring(0, 2)}/${sha.substring(2)}`;

    if (fs.existsSync(path)) {
        const trees: Tree[] = [];

        const content = zlib.unzipSync(fs.readFileSync(path));
        const rows = content.subarray(content.indexOf('\0') + 1);

        let nullIndex = 0;
        for (let i = 0; i < rows.length; i = nullIndex + 21) {
            const spaceIndex = rows.indexOf(' ', i);
            nullIndex = rows.indexOf('\0', spaceIndex);

            const mode = rows.subarray(i, spaceIndex).toString();
            const name = rows.subarray(spaceIndex + 1, nullIndex).toString();
            const shaHex = rows.subarray(nullIndex + 1, nullIndex + 21).toString('hex');

            const type = mode === '100644' ? 'blob' : 'tree';

            trees.push({
                mode,
                name,
                type,
                sha: shaHex
            });
        }

        const orderedTrees = sortBy(trees, 'name');

        if (flag === "--name-only") {
            for (const tree of orderedTrees) {
                console.log(tree.name);
            }
            return;
        }
        for (const tree of orderedTrees) {
            console.log(`${tree.mode} ${tree.type} ${tree.sha}\t${tree.name}`);       
        }
    } else {
        console.log(`fatal: not a valid object name: '${sha}'.`);
    }
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
        const sha = writeToBlob(path, flag === "-w");
        process.stdout.write(sha);
        break;
    case Commands.WriteTree:
        const treeSha = writeTree(process.cwd());
        process.stdout.write(treeSha);
        break;
    case Commands.LsTree:
        readTree(args);
        break;
    case Commands.CommitTree:
        const csha = args[1];
        const psha = args[3];
        let message = args[5];
        const author = 'Farrel Nikoson <farrelnikoson@test.com> 1634216460 -0400';
        let content = `tree ${csha}\nparent ${psha}\nauthor ${author}\ncommiter ${author}\n\n${message}\n`;
        if (args[2] === '-m') {
            message = psha;
            content = `tree ${csha}\nauthor ${author}\ncommiter ${author}\n\n${message}\n`;
        };
        const commit = `commit ${content.length}\0${content}`;
        const hash = crypto.createHash('sha1').update(commit).digest('hex');
        const dir = hash.substring(0, 2);
        const file = hash.substring(2);
        fs.mkdirSync(`.git/objects/${dir}`, { recursive: true });
        fs.writeFileSync(`.git/objects/${dir}/${file}`, zlib.deflateSync(commit));
        process.stdout.write(hash);
        break;
    default:
        throw new Error(`Unknown command ${command}`);
}
