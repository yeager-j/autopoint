import { VercelRequest, VercelResponse } from '@vercel/node';

export default (request: VercelRequest, response: VercelResponse) => {
    try {
        response.send(request.body);
    } catch (e) {
        response.status(400).send("Cannot parse the request body!");
    }
}