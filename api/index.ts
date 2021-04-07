import { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAPIRequestValidator from 'openapi-request-validator';
import schema from './schema.json';

const requestValidator = new OpenAPIRequestValidator({
    requestBody: schema.paths['/orders'].post.requestBody
});

const parseXml = (request: VercelRequest): Promise<string> => {
    return new Promise((resolve, reject) => {
        let chunks: Uint8Array[] = [];

        if (request.headers['content-type'] !== 'application/xml') {
            reject(new Error('Wrong content-type! Only accepts application/xml'));
        }

        request.on('data', (chunk) => {
            chunks.push(chunk);
        }).on('end', () => {
            resolve(Buffer.concat(chunks).toString());
        });
    });
}

export default async (request: VercelRequest, response: VercelResponse) => {
    const body = await parseXml(request);

    console.log(requestValidator.validateRequest({
        headers: {
            ['Content-Type']: 'application/xml'
        },
        body,
        params: {},
        query: {}
    }));

    response.send('OK');
}