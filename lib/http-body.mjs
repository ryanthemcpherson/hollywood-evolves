function bodyError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function safelyDrain(request) {
  const onDrainError = () => {};
  const cleanup = () => {
    request.removeListener('error', onDrainError);
    request.removeListener('end', cleanup);
    request.removeListener('close', cleanup);
  };
  request.on('error', onDrainError);
  request.once('end', cleanup);
  request.once('close', cleanup);
  request.resume();
}

export function readJson(request, maxBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) {
      safelyDrain(request);
      reject(bodyError('Content-Type must be application/json', 415));
      return;
    }

    let chunks = [];
    let bytes = 0;
    let settled = false;

    const cleanup = () => {
      request.removeListener('data', onData);
      request.removeListener('end', onEnd);
      request.removeListener('error', onError);
    };
    const onData = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) {
        settled = true;
        chunks = [];
        cleanup();
        safelyDrain(request);
        reject(bodyError('Request body is too large', 413));
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        resolve(JSON.parse(text));
      } catch (error) {
        reject(bodyError(error instanceof TypeError ? 'Request body must be valid UTF-8' : 'Invalid JSON', 400));
      }
    };
    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', onError);
  });
}
