import { VercelRequest, VercelResponse } from '@vercel/node';
import cheerio from 'cheerio';
import validUrl from 'valid-url';
import { unimplemented } from './util';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

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

/*
Validations for AutoPoint XML
document root is <StoreOrder>
  attributes "StoreID", "PartnerID", "StoreOrderDate" exists
    child is <Order> exists, count == 1
    <Order> checks
      children are <Customer>, <OrderDetails>, <CarrierAccount> and <MailSupport> exist, count == 1 (each)
      <OrderDetails> checks
        attributes "StoreShippingMethodID", "StoreProductID and "StoreOrderDetailID" exists
        <Quantity> > 0
        <DueDate> is a valid date and is today or later date
        <Files/File/PathType/*> == "URL"
        <Files/File/Path/*> contains valid HTTP or S3 bucket URNs
      <MailSupport> checks
        <SupportFile/PathType/*> == "URL"
        <SupportFile/Path/*> contains valid HTTP or S3 bucket URNs
 */

const validateXml = (body: string): boolean => {
    const $ = cheerio.load(body, {xmlMode: true});

    const storeOrder = $('StoreOrder');

    if (!storeOrder) {
        return false;
    }

    const attrs = storeOrder.attr();

    if (!attrs.StoreID || !attrs.PartnerID || !attrs.StoreOrderDate) {
        return false;
    }

    const orders = $('StoreOrder > Order');

    if (orders.toArray().length !== 1) {
        return false;
    }

    if (!orders.children('Customer')) {
        return false;
    }

    if (!orders.children('CarrierAccount')) {
        return false;
    }

    const orderDetails = $('StoreOrder > Order > OrderDetails > OrderDetail');

    if (!orderDetails || orderDetails.toArray().length !== 1) {
        return false;
    }

    const orderDetailAttrs = orderDetails.attr();

    if (!orderDetailAttrs.StoreShippingMethodID || !orderDetailAttrs.StoreProductID || !orderDetailAttrs.StoreOrderDetailID) {
        return false;
    }

    const quantity = orderDetails.children('Quantity').text();

    if (+quantity < 0) {
        return false;
    }

    const dueDate = orderDetails.children('DueDate').text();

    try {
        const date = new Date(dueDate).getTime();
        const now = Date.now();

        if (date < now) {
            return false;
        }
    } catch (_e) {
        return false;
    }

    const file = orderDetails.children('Files').children('File');

    if (file.children('PathType').text() !== 'URL') {
        console.log('not url');
        return false;
    }

    if (!validUrl.isUri(file.children('Path').text())) {
        return false;
    }

    const mailSupport = $('StoreOrder > Order > MailSupport');
    const supportFiles = mailSupport.children('SupportFile').toArray();

    for (const supportFile of supportFiles) {
        const $$ = $(supportFile);

        if ($$.children('PathType').text() !== 'URL') {
            return false;
        }

        if (!validUrl.isUri($$.children('Path').text())) {
            return false;
        }
    }

    return true;
}

export default async (request: VercelRequest, response: VercelResponse) => {
    const body = await parseXml(request);
    const isValid = validateXml(body);

    if (isValid) {
        const client = new S3Client({
            region: process.env.TARGET_REGION
        });

        const upload = new Upload({
            client,
            params: {
                Bucket: process.env.TARGET_BUCKET,
                Body: body,
                Key: `Orders/${Date.now()}.xml`,
                ContentType: 'application/xml'
            }
        });

        upload.done()
            .then(() => {
                response.status(201).send('OK');
            })
            .catch(() => {
                response.status(500).send('Unable to upload Order XML to S3 bucket!');
            });
    } else {
        response.status(400).send('Invalid XML!');
    }
}