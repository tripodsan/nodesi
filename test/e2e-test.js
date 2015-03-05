/* jshint node:true */
/* global describe, it, beforeEach, afterEach */

'use strict';

var assert = require('assert'),
    http = require('http'),
    ESI = require('../esi'),
    Clock = require('./clock'),
    Cache = require('../cache');

describe('ESI processor', function () {

    var server = null;
    var port = '';

    // setup listening server and update port
    beforeEach(function () {
        server = new http.Server();
        server.listen();
        port = server.address().port;
    });

    afterEach(function () {
        server.close();
        server = null;
    });


    it('should fetch one external component', function (done) {

        // given
        server.addListener('request', function (req, res) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<div>test</div>');
        });

        var html = '<section><esi:include src="http://localhost:' + port + '"></esi:include></section>';

        // when
        var processed = new ESI().process(html);

        // then
        processed.then(function (response) {
            assert.equal(response, '<section><div>test</div></section>');
            done();
        }).catch(done);

    });

    it('should fetch one relative component', function (done) {

        // given
        server.addListener('request', function (req, res) {
            if (req.url === '/header') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<div>test</div>');
            } else {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('not found');
            }
        });

        var html = '<esi:include src="/header"></esi:include>';

        // when
        var processed = new ESI({
            baseUrl: 'http://localhost:' + port
        }).process(html);

        // then
        processed.then(function (response) {
            assert.equal(response, '<div>test</div>');
            done();
        }).catch(done);

    });


    it('should fetch one relative component (no leading slash)', function (done) {

        // given
        server.addListener('request', function (req, res) {
            if (req.url === '/header') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<div>test</div>');
            } else {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('not found');
            }
        });

        var html = '<esi:include src="header"></esi:include>';

        // when
        var processed = new ESI({
            baseUrl: 'http://localhost:' + port
        }).process(html);

        // then
        processed.then(function (response) {
            assert.equal(response, '<div>test</div>');
            done();
        }).catch(done);

    });


    it('should fetch multiple components', function (done) {

        // given
        server.addListener('request', function (req, res) {
            if (req.url === '/header') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<div>test header</div>');
            } else if (req.url === '/footer') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<div>test footer</div>');
            }
            else {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('not found');
            }
        });

        var html = '<esi:include src="/header"></esi:include><esi:include src="/footer"></esi:include>';

        // when
        var processed = new ESI({
            baseUrl: 'http://localhost:' + port
        }).process(html);

        // then
        processed.then(function (response) {
            assert.equal(response, '<div>test header</div><div>test footer</div>');
            done();
        }).catch(done);

    });

    it('should handle immediately closed html tags', function (done) {

        // given
        server.addListener('request', function (req, res) {
            if (req.url === '/header') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<section></section><div>something</div>');
            } else {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('not found');
            }
        });

        var html = '<esi:include src="/header"></esi:include>';

        // when
        var processed = new ESI({
            baseUrl: 'http://localhost:' + port
        }).process(html);

        // then
        processed.then(function (response) {
            assert.equal(response, '<section></section><div>something</div>');
            done();
        }).catch(done);

    });

    it('should handle immediately closed esi tags', function (done) {

        // given
        server.addListener('request', function (req, res) {
            if (req.url === '/header') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<div>something</div>');
            } else {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('not found');
            }
        });

        var html = '<esi:include src="/header"/>';

        // when
        var processed = new ESI({
            baseUrl: 'http://localhost:' + port
        }).process(html);

        // then
        processed.then(function (response) {
            assert.equal(response, '<div>something</div>');
            done();
        }).catch(done);

    });

    it('should gracefully degrade to empty content on error', function (done) {

        // given
        server.addListener('request', function (req, res) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end();
        });

        var html = '<esi:include src="/error"></esi:include>';

        // when
        var processed = new ESI({
            baseUrl: 'http://localhost:' + port
        }).process(html);

        // then
        processed.then(function (response) {
            assert.equal(response, '');
            done();
        }).catch(done);

    });

    it('should gracefully degrade to empty content on timeout', function (done) {

        // given
        server.addListener('request', function (req, res) {
            setTimeout(function () {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('this should not happen');
            }, 10);
        });

        var html = '<esi:include src="/error"></esi:include>';

        // when
        var processed = new ESI({
            baseUrl: 'http://localhost:' + port,
            defaultTimeout: 1
        }).process(html);

        // then
        processed.then(function (response) {
            assert.equal(response, '');
            done();
        }).catch(done);

    });

    it('should populate internal cache after first successful request', function (done) {

        // given
        server.addListener('request', function (req, res) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('hello');
        });

        var html = '<esi:include src="/cacheme"></esi:include>';

        // when
        var esi = new ESI({
            baseUrl: 'http://localhost:' + port,
            cache: new Cache()
        });

        var processed = esi.process(html);

        // then
        processed.then(function (response) {
            return esi.cache.get('http://localhost:' + port + '/cacheme');
        }).then(function (cached) {
                assert.equal(cached.value, 'hello');
                done();
            }).catch(done);

    });

    it('should return data from the cache', function (done) {

        // given
        var cache = new Cache();

        // when
        var html = '<esi:include src="/cacheme"></esi:include>';
        cache.set('http://example.com/cacheme', {
            value: 'stuff'
        });
        var esi = new ESI({
            baseUrl: 'http://example.com',
            cache: cache
        });

        var processed = esi.process(html);

        // then
        processed.then(function (response) {
            assert.equal(response, 'stuff');
            done();
        }).catch(done);

    });

    it('should respect cache-control headers', function (done) {

        // given
        var responseCount = 0;
        function body() {
            if (responseCount === 0) {
                responseCount++;
                return 'hello';
            } else {
                return 'world';
            }
        }
        
        var clock = new Clock();
        var cache = new Cache({
            clock: clock
        });

        // when
        var html = '<esi:include src="/cacheme"></esi:include>';
        var esi = new ESI({
            baseUrl: 'http://localhost:' + port,
            cache: cache,
            request: {
                get: function(options, callback) {
                    callback(null, {
                        statusCode: 200,
                        headers: {
                            'cache-control': 'public, max-age=1'
                        } 
                    }, body());
                }
            }
        });

        var processed = esi.process(html);


        // then
        processed.then(function (response) {
            assert.equal(response, 'hello');
            clock.tick(2000);
            return esi.process(html);
        }).then(function (response) {
            assert.equal(response, 'hello');
            return esi.process(html);
        }).then(function(response) {
            assert.equal(response, 'world');
            done();
        }).catch(done);
    });

});
