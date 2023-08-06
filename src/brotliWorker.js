self.onmessage = function(event) {
    try {
        const arrayBuffer = event.data;
        const decompressedData = BrotliDecode(new Uint8Array(arrayBuffer));
        self.postMessage(decompressedData.buffer, [decompressedData.buffer]);
    } catch (error) {
        self.postMessage({ error: error.message });
    }
};
self.postMessage('READY');