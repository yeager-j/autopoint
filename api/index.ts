import { VercelRequest, VercelResponse } from '@vercel/node';

export default (request: VercelRequest, response: VercelResponse) => {
    let chunks: Uint8Array[] = [];
    
    request.on('data', (chunk) => {
        chunks.push(chunk);
    }).on('end', () => {
        const body = Buffer.concat(chunks).toString();

        console.log(body);

        response.send(body);
    });
}