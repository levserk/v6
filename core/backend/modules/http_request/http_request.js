'use strict';

let http = require('http');
let moduleName = 'HttpRequest';
let logger, log, err, wrn;
let co = require('co');

let defaultConf = {
    options: {
        protocol: 'http:',
        hostname: '127.0.0.1',
        port: '8081'
    },
    timeout: 5000
};

module.exports = class HttpRequest  {
    constructor(server, conf) {
        logger = server.logger.getLogger(moduleName);
        log = logger.log;
        wrn = logger.wrn;
        err = logger.err;
        this.conf = Object.assign(defaultConf, conf);
    }

    createHeaders(dataString) {
        return dataString ? {
            'Cookie': 'userId=0',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(dataString,'utf8')
        } : {
            'Cookie': 'userId=0'
        };
    }

    sendRequest(path, method, postData) {
        method = method.toUpperCase();

        if (method !== 'GET' && method !== 'PUT' && method!== 'POST' && method !== 'GET') {
            method = 'GET';
        }

        if (method === 'POST' && postData && typeof postData === "object") {
            postData = JSON.stringify(postData);
        } else {
            postData = null;
        }

        let options = {
            path: path,
            method: method,
            headers: this.createHeaders(postData)
        };

        options = Object.assign({}, this.conf.options, options);

        return new Promise((res, rej) => {

            log(`sendRequest`, `path: ${path}, options: ${JSON.stringify(options)}`);

            let request = http.request(options, (response) => {
                let statusCode = response.statusCode;
                let body = '';
                log(`sendRequest`, `request, status: ${statusCode}`);
                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    body+=chunk;
                });
                response.on('end', () => {
                    if (statusCode === 200) {
                        log(`sendRequest`, `path: ${path} done, response: ${body}`);
                        res(JSON.parse(body));
                    } else {
                        log(`sendRequest`, `path: ${path} done, status: ${statusCode}, response: ${body}`);
                        res(null);
                    }
                });
            });

            request.on('error', function(e) {
                err(`sendRequest`,`path: ${path},  error: ${e}`);
                rej(e);
            });

            request.setTimeout(this.conf.timeout, () => {
                err(`sendRequest`, `path: ${path} timeout`);
                res(null);
            });

            if (method === 'POST' || method === 'PUT') {
                request.write(postData || '');
            }
            request.end();
        });
    }
};