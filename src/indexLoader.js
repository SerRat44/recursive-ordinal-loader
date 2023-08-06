async function runIndexLoader() {
    async function loadAndAppendResource(resource) {
        const { type, content, module } = resource;
        return new Promise((resolve, reject) => {
            let node;
            switch (type) {
                case 'js':
                    node = document.createElement('script');
                    node.textContent = content;
                    if (module) {
                        node.type = 'module';
                    }
                    break;
                case 'css':
                    node = document.createElement('style');
                    node.textContent = content;
                    break;
                case 'html':
                    node = document.createElement('div');
                    node.innerHTML = content;
                    break;
                default:
                    return reject(new Error(`Unknown resource type: ${type}`));
            }
            document.body.appendChild(node);
            resolve();
        });
    }

    function setFavicon(path) {
        try {
            let link = document.querySelector("link[rel*='icon']") || document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = path;
            document.getElementsByTagName('head')[0].appendChild(link);
        } catch (error) {
            console.error(`Failed to set favicon: ${error}`);
        }
    }

    async function pathToContents(path) {
        try {
            const response = await fetch(path);
            return response.text();
        } catch (error) {
            console.error(`Failed to fetch from path ${path}: ${error}`);
        }
    }

    async function createWebWorker(workerUrl, libraryScripts) {
        const response = await fetch(workerUrl);
        const workerScriptText = await response.text();

        if (typeof libraryScripts === 'string') {
            libraryScripts = [libraryScripts];
        }
        const combinedScriptText = [...libraryScripts, workerScriptText].join('\n');
		
		const workerDataURL = `data:text/javascript;base64,${btoa(combinedScriptText)}`;

        return new Promise((resolve, reject) => {
            const worker = new Worker(workerDataURL);

            worker.onmessage = function(event) {
                if (event.data === 'READY') {
                    resolve(worker);
                }
            };
            worker.onerror = function(event) {
                reject(event.message);
            };
        });
    }

    async function decompressResource(compressionType, compressedFilePath) {
        return new Promise((resolve, reject) => {
            let worker;
            switch (compressionType) {
                case 'gunzip':
                    worker = gunzipWorker;
                    break;
                case 'brotli':
                    worker = brotliWorker;
                    break;
                default:
                    return reject(new Error(`Unknown compression type: ${compressionType}`));
            }

            worker.onmessage = function(event) {
                if (event.data.error) {
                    reject(new Error(`${compressionType} decompression failed for ${compressedFilePath}: ${event.data.error}`));
                } else {
                    const textDecoder = new TextDecoder();
                    resolve(textDecoder.decode(new Uint8Array(event.data)));
                }
            };

            worker.onerror = function(event) {
                reject(event.message);
            };

            fetch(compressedFilePath)
                .then(response => response.arrayBuffer())
                .then(arrayBuffer => {
                    const arrayBufferView = new Uint8Array(arrayBuffer);
                    worker.postMessage(arrayBufferView.buffer, [arrayBufferView.buffer]);
                })
                .catch(error => {
                    reject(error);
                });
        });
    }
	
    async function webWorkerLoader() {
        const brotliDecoderLib = await pathToContents('./brotliDecode.min.js');
        brotliWorker = await createWebWorker('./brotliWorker.js', brotliDecoderLib);
    }

    async function indexLoaderStart() {
        try {
            setFavicon(favicon);

            await webWorkerLoader();

            for (const pageResource of pageResources) {
                try {
                    let content;
                    if (pageResource.compression && pageResource.compression !== 'none') {
                        content = await decompressResource(pageResource.compression, pageResource.path);
                    } else {
                        content = await pathToContents(pageResource.path);
                    }
                    pageResource.content = content;
                    await loadAndAppendResource(pageResource);
                    console.log(`loaded ${pageResource.name}`);
                } catch (error) {
                    console.error(`Failed to load ${pageResource.name}: ${error}`);
                }
            }
        } finally {
            if (brotliWorker) {
                brotliWorker.terminate();
                brotliWorker = null;
            }
        }
    }

    let brotliWorker = null;
    let gunzipWorker = null;

    const favicon = './recursiveLabsLogo.png';

    const pageResources = [
        {
            name: 'three.min.js.br',
            path: './three.min.js.br',
            type: 'js',
            compression: 'brotli',
        },
		{
			name: 'index.js',
			path: './index.js',
			type: 'js',
			compression: 'none',
		}
    ];

    await indexLoaderStart();
	window.dispatchEvent(new Event('indexLoaderComplete'));
}

(async function() {
	await runIndexLoader();
}());