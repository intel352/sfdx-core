/*
 * Copyright (c) 2016, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as dns from 'dns';
import { assert, expect } from 'chai';
import { AuthInfo } from '../../lib/authInfo';
// import Global from '../../lib/global';
import { AuthInfoConfigFile } from '../../lib/config/authInfoConfigFile';
import { ConfigFile } from '../../lib/config/configFile';
import { KeychainConfigFile } from '../../lib/config/keychainConfigFile';
import { Crypto } from '../../lib/crypto';
import { SfdxUtil } from '../../lib/util';
import { OAuth2 } from 'jsforce';
import * as Transport from 'jsforce/lib/transport';
import * as jwt from 'jsonwebtoken';
import { testSetup } from '../testSetup';
import { SfdxError } from '../../lib/sfdxError';
import { toUpper as _toUpper, includes as _includes } from 'lodash';

const TEST_KEY = {
    service: 'sfdx',
    account: 'local',
    key: '8e8fd1e6dc06a37bf420898dbc3ee35c'
};

// Setup the test environment.
const $$ = testSetup();

describe('AuthInfo No fs mock', () => {
    const username = 'doesnt_exists@gb.com';
    beforeEach(() => {
        $$.SANDBOX.stub(AuthInfoConfigFile.prototype, 'write').callsFake(async function() {
            const path = this.path();
            if (path.includes('key.json')) {
                return Promise.resolve(TEST_KEY);
            } else if (path.includes(username)) {
                const error: any = new SfdxError('Test error', 'testError');
                error.code = 'ENOENT';
                return Promise.reject(error);
            } else {
                return Promise.reject(new SfdxError('Not mocked - unhandled test case', 'UnsupportedTestCase'));
            }
        });
    });

    it ('missing config', async () => {
        const expectedErrorName = 'namedOrgNotFound';
        try {
            await AuthInfo.create('doesnt_exists@gb.com');
            assert.fail(`should have thrown error with name: ${expectedErrorName}`);
        } catch (e) {
            expect(e).to.have.property('name', expectedErrorName);
        }
    });
});

// Cleanly encapsulate the test data.
class MetaAuthDataMock {

    private _instanceUrl: string = 'http://mydevhub.localhost.internal.salesforce.com:6109';
    private _accessToken: string = 'authInfoTest_access_token';
    private _encryptedAccessToken: string = this._accessToken;
    private _refreshToken: string = 'authInfoTest_refresh_token';
    private _encryptedRefreshToken: string = this._refreshToken;
    private _clientId: string = 'authInfoTest_client_id';
    private _loginUrl: string = 'authInfoTest_login_url';
    private _jwtUsername: string = 'authInfoTest_username_JWT';
    private _redirectUri: string = 'http://localhost:1717/OauthRedirect';
    private _authCode: string = 'authInfoTest_authCode';
    private _authInfoLookupCount: number = 0;
    private _defaultConnectedAppInfo: any = {
        clientId: 'SalesforceDevelopmentExperience',
        clientSecret: '1384510088588713504'
    };

    constructor() {
        this._jwtUsername = `${this._jwtUsername}_${$$.uniqid()}`;
    }

    get instanceUrl(): string {
        return this._instanceUrl;
    }

    set instanceUrl(value: string) {
        this._instanceUrl = value;
    }

    get accessToken(): string {
        return this._accessToken;
    }

    get refreshToken(): string {
        return this._refreshToken;
    }

    get clientId(): string {
        return this._clientId;
    }

    get loginUrl(): string {
        return this._loginUrl;
    }

    set loginUrl(value: string) {
        this._loginUrl = value;
    }

    get jwtUsername(): string {
        return this._jwtUsername;
    }

    set jwtUsername(value: string) {
        this._jwtUsername = value;
    }

    get redirectUri(): string {
        return this._redirectUri;
    }

    get authCode(): string {
        return this._authCode;
    }

    set authCode(value: string) {
        this._authCode = value;
    }

    get defaultConnectedAppInfo(): any {
        return this._defaultConnectedAppInfo;
    }

    set defaultConnectedAppInfo(value: any) {
        this._defaultConnectedAppInfo = value;
    }

    get encryptedAccessToken(): string {
        return this._encryptedAccessToken;
    }

    set encryptedAccessToken(value: string) {
        this._encryptedAccessToken = value;
    }

    set encryptedRefreshToken(value: string) {
        this._encryptedRefreshToken = value;
    }

    get authInfoLookupCount(): number {
        return this._authInfoLookupCount;
    }

    public async fetchConfigInfo(path: string): Promise<any> {
        if (path.includes(KeychainConfigFile.KEYCHAIN_FILENAME)) {
            return Promise.resolve(TEST_KEY);
        } else if (_includes(_toUpper(path), '_JWT')) {
            this._authInfoLookupCount = this._authInfoLookupCount + 1;
            return Promise.resolve({
                instanceUrl: 'http://mydevhub.localhost.internal.salesforce.com:6109',
                accessToken: this.encryptedAccessToken,
                privateKey: '123456'
            });
        } else {
            return Promise.reject(
                new SfdxError('Not mocked - unhandled test case', 'UnsupportedTestCase'));
        }
    }

    public async statForKeyFile(path: string): Promise<any> {
        if (!_includes(path, 'key.json')) {
            return new SfdxError(`Unexpected path: ${path}`, 'UnexpectedInput');
        }

        return Promise.resolve({
            dev: 16777221,
            mode: 16768,
            nlink: 32,
            uid: 1613127851,
            gid: 0,
            rdev: 0,
            blksize: 4194304,
            ino: 81943357,
            size: 1024,
            blocks: 0,
            atimeMs: 1517934734270.9426,
            mtimeMs: 1517879310026.148,
            ctimeMs: 1517879310026.148,
            birthtimeMs: 1510678165000,
            atime: new Date('2018-02-06T16:32:14.271Z'),
            mtime: new Date('2018-02-06T01:08:30.026Z'),
            ctime: new Date('2018-02-06T01:08:30.026Z'),
            birthtime: new Date('2017-11-14T16:49:25.000Z')
        });
    }
}

describe('AuthInfo', () => {

    let readFileStub;
    let _postParmsStub;

    let testMetadata: MetaAuthDataMock;

    beforeEach(async () => {
        testMetadata = new MetaAuthDataMock();

        $$.SANDBOX.stub(SfdxUtil, 'stat').callsFake(async (path) => {
            return testMetadata.statForKeyFile(path);
        });

        // Common stubs
        $$.SANDBOX.stub(ConfigFile.prototype, 'write').callsFake(async () => {
            return Promise.resolve();
        });

        $$.SANDBOX.stub(ConfigFile.prototype, 'readJSON').callsFake(async function() {
            return testMetadata.fetchConfigInfo(this.path);
        });

        const crypto = await Crypto.create();
        testMetadata.encryptedAccessToken = crypto.encrypt(testMetadata.accessToken);
        testMetadata.encryptedRefreshToken = crypto.encrypt(testMetadata.refreshToken);

        // These stubs return different objects based on the tests
        _postParmsStub = $$.SANDBOX.stub(OAuth2.prototype, '_postParams');
        readFileStub = $$.SANDBOX.stub(SfdxUtil, 'readFile');

        // Spies
        $$.SANDBOX.spy(AuthInfo.prototype, 'init');
        $$.SANDBOX.spy(AuthInfo.prototype, 'update');
        $$.SANDBOX.spy(AuthInfo.prototype, 'buildJwtConfig');
        $$.SANDBOX.spy(AuthInfo.prototype, 'buildRefreshTokenConfig');
        $$.SANDBOX.spy(AuthInfo.prototype, 'buildWebAuthConfig');
    });

    describe('create()', () => {
        it('should return an AuthInfo instance when passed an access token as username', async () => {
            const username = '00Dxx0000000001!AQEAQI3AIbublfW11ATFJl9T122vVPj5QaInBp6h9nPsUK8oW4rW5Os0ZjtsUU.DG9rXytUCh3RZvc_XYoRULiHeTMjyi6T1';
            const authInfo = await AuthInfo.create(username);

            const expectedFields = { accessToken: username, instanceUrl: testMetadata.instanceUrl };
            expect(authInfo.getConnectionOptions()).to.deep.equal(expectedFields);
            expect(authInfo.isAccessTokenFlow(), 'authInfo.isAccessTokenFlow() should be true').to.be.true;
            expect(authInfo.isRefreshTokenFlow(), 'authInfo.isRefreshTokenFlow() should be false').to.be.false;
            expect(authInfo.isJwt(), 'authInfo.isJwt() should be false').to.be.false;
            expect(authInfo.isOauth(), 'authInfo.isOauth() should be false').to.be.false;
        });

        //
        // JWT Tests
        //

        describe('ordered test', () => {
            // There is an implicit order in these tests. Hence the isolation in the describe and the unique
            // username that is generated in the MetaMock constructor.
            const sharedTestMeta = new MetaAuthDataMock();
            beforeEach(async () => {
                testMetadata = sharedTestMeta;
            });

            it('should return a JWT AuthInfo instance when passed a username and JWT auth options', async () => {
                const jwtConfig = {
                    clientId: testMetadata.clientId,
                    loginUrl: testMetadata.loginUrl,
                    privateKey: 'authInfoTest/jwt/server.key'
                };
                const authResponse = {
                    access_token: testMetadata.accessToken,
                    instance_url: testMetadata.instanceUrl,
                    id: '00DAuthInfoTest_orgId/005AuthInfoTest_userId'
                };

                // Stub file I/O, http requests, and the DNS lookup
                readFileStub.returns(Promise.resolve('authInfoTest_private_key'));
                _postParmsStub.returns(Promise.resolve(authResponse));
                $$.SANDBOX.stub(jwt, 'sign').returns(Promise.resolve('authInfoTest_jwtToken'));
                $$.SANDBOX.stub(dns, 'lookup').returns(Promise.resolve());

                // Create the JWT AuthInfo instance
                const authInfo = await AuthInfo.create(testMetadata.jwtUsername, jwtConfig);

                // Verify the returned AuthInfo instance
                const authInfoJSON = authInfo.getConnectionOptions();
                expect(authInfoJSON).to.have.property('accessToken', authResponse.access_token);
                expect(authInfoJSON).to.have.property('instanceUrl', authResponse.instance_url);
                expect(authInfoJSON).to.have.property('refreshFn').and.is.a('function');
                expect(authInfo.username).to.equal(testMetadata.jwtUsername);
                expect(authInfo.authFileName).to.equal(`${testMetadata.jwtUsername}.json`);
                expect(authInfo.isAccessTokenFlow(), 'authInfo.isAccessTokenFlow() should be false').to.be.false;
                expect(authInfo.isRefreshTokenFlow(), 'authInfo.isRefreshTokenFlow() should be false').to.be.false;
                expect(authInfo.isJwt(), 'authInfo.isJwt() should be true').to.be.true;
                expect(authInfo.isOauth(), 'authInfo.isOauth() should be false').to.be.false;

                // Verify expected methods are called with expected args
                expect(AuthInfo.prototype.init['called']).to.be.true;
                expect(AuthInfo.prototype.init['firstCall'].args[0]).to.equal(jwtConfig);
                expect(AuthInfo.prototype.update['called']).to.be.true;
                expect(AuthInfo.prototype['buildJwtConfig']['called']).to.be.true;
                expect(AuthInfo.prototype['buildJwtConfig']['firstCall'].args[0]).to.equal(jwtConfig);
                expect(SfdxUtil.readFile['called']).to.be.true;

                const expectedAuthConfig = {
                    accessToken: authResponse.access_token,
                    instanceUrl: testMetadata.instanceUrl,
                    orgId: authResponse.id.split('/')[0],
                    loginUrl: jwtConfig.loginUrl,
                    privateKey: jwtConfig.privateKey
                };
                expect(AuthInfo.prototype.update['firstCall'].args[0]).to.deep.equal(expectedAuthConfig);
            });

            // This test relies on the previous test caching the AuthInfo.
            it('should return a cached JWT AuthInfo instance when passed a username', async () => {
                // Create the JWT AuthInfo instance
                const authInfo = await AuthInfo.create(testMetadata.jwtUsername);

                // Verify the returned AuthInfo instance
                const authInfoJSON = authInfo.getConnectionOptions();
                expect(authInfoJSON).to.have.property('accessToken', testMetadata.accessToken);
                expect(authInfoJSON).to.have.property('instanceUrl', testMetadata.instanceUrl);
                expect(authInfoJSON).to.have.property('refreshFn').and.is.a('function');
                expect(authInfo.username).to.equal(testMetadata.jwtUsername);
                expect(authInfo.authFileName).to.equal(`${testMetadata.jwtUsername}.json`);
                expect(authInfo.isAccessTokenFlow(), 'authInfo.isAccessTokenFlow() should be false').to.be.false;
                expect(authInfo.isRefreshTokenFlow(), 'authInfo.isRefreshTokenFlow() should be false').to.be.false;
                expect(authInfo.isJwt(), 'authInfo.isJwt() should be true').to.be.true;
                expect(authInfo.isOauth(), 'authInfo.isOauth() should be false').to.be.false;

                // Verify correct method calls
                expect(AuthInfo.prototype.init['called']).to.be.true;
                expect(AuthInfo.prototype.init['firstCall'].args[0], 'should NOT have passed any args to AuthInfo.init()').to.be.undefined;
                expect(AuthInfo.prototype.update['called']).to.be.true;
                expect(AuthInfo.prototype['buildJwtConfig']['called'], 'should NOT have called AuthInfo.buildJwtConfig() - should get from cache').to.be.false;
                expect(testMetadata.authInfoLookupCount === 0, 'should NOT have called Global.fetchConfigInfo() for auth info').to.be.true;
            });
        });

        it('should return a JWT AuthInfo instance when passed a username from an auth file', async () => {
            const username = 'authInfoTest_username_jwt-NOT-CACHED';

            // Make the file read stub return JWT auth data
            const jwtData = {
                accessToken: testMetadata.encryptedAccessToken,
                clientId: testMetadata.clientId,
                loginUrl: testMetadata.loginUrl,
                instanceUrl: testMetadata.instanceUrl,
                privateKey: 'authInfoTest/jwt/server.key'
            };
            readFileStub.returns(Promise.resolve(JSON.stringify(jwtData)));

            // Create the JWT AuthInfo instance
            const authInfo = await AuthInfo.create(username);

            // Verify the returned AuthInfo instance
            const authInfoJSON = authInfo.getConnectionOptions();
            expect(authInfoJSON).to.have.property('accessToken', testMetadata.accessToken);
            expect(authInfoJSON).to.have.property('instanceUrl', testMetadata.instanceUrl);
            expect(authInfoJSON).to.have.property('refreshFn').and.is.a('function');
            expect(authInfo.username).to.equal(username);
            expect(authInfo.authFileName).to.equal(`${username}.json`);
            expect(authInfo.isAccessTokenFlow(), 'authInfo.isAccessTokenFlow() should be false').to.be.false;
            expect(authInfo.isRefreshTokenFlow(), 'authInfo.isRefreshTokenFlow() should be false').to.be.false;
            expect(authInfo.isJwt(), 'authInfo.isJwt() should be true').to.be.true;
            expect(authInfo.isOauth(), 'authInfo.isOauth() should be false').to.be.false;

            // Verify authInfo.fields are encrypted
            expect(authInfo['fields'].accessToken).equals(jwtData.accessToken);

            // Verify correct method calls
            expect(AuthInfo.prototype.init['called']).to.be.true;
            expect(AuthInfo.prototype.init['firstCall'].args[0], 'should NOT have passed any args to AuthInfo.init()').to.be.undefined;
            expect(AuthInfo.prototype.update['called']).to.be.true;
            expect(AuthInfo.prototype['buildJwtConfig']['called'], 'should NOT have called AuthInfo.buildJwtConfig() - should get from cache').to.be.false;
            expect(testMetadata.authInfoLookupCount > 0, 'should have called Global.fetchConfigInfo() for auth info').to.be.true;
        });

        it('should throw a JWTAuthError when auth fails via a OAuth2.jwtAuthorize()', async () => {
            const username = 'authInfoTest_username_jwt_ERROR1';
            const jwtConfig = {
                clientId: testMetadata.clientId,
                loginUrl: testMetadata.loginUrl,
                privateKey: 'authInfoTest/jwt/server.key'
            };

            // Stub file I/O, http requests, and the DNS lookup
            readFileStub.returns(Promise.resolve('authInfoTest_private_key'));
            _postParmsStub.throws(new Error('authInfoTest_ERROR_MSG'));
            $$.SANDBOX.stub(jwt, 'sign').returns(Promise.resolve('authInfoTest_jwtToken'));
            $$.SANDBOX.stub(dns, 'lookup').returns(Promise.resolve());

            // Create the JWT AuthInfo instance
            try {
                await AuthInfo.create(username, jwtConfig);
                assert.fail('should have thrown an error within AuthInfo.buildJwtConfig()');
            } catch (err) {
                expect(err.name).to.equal('JWTAuthError');
            }
        });

        it('should catch a DNS error and set the instanceUrl when DNS lookup fails', async () => {
            const username = 'authInfoTest_username_jwt_ERROR2';
            const jwtConfig = {
                clientId: testMetadata.clientId,
                loginUrl: testMetadata.loginUrl,
                privateKey: 'authInfoTest/jwt/server.key'
            };
            const authResponse = {
                access_token: testMetadata.accessToken,
                instance_url: testMetadata.instanceUrl,
                id: '00DAuthInfoTest_orgId/005AuthInfoTest_userId'
            };

            // Stub file I/O, http requests, and the DNS lookup
            readFileStub.returns(Promise.resolve('authInfoTest_private_key'));
            _postParmsStub.returns(Promise.resolve(authResponse));
            $$.SANDBOX.stub(jwt, 'sign').returns(Promise.resolve('authInfoTest_jwtToken'));
            $$.SANDBOX.stub(dns, 'lookup').throws(new Error('authInfoTest_ERROR_MSG'));

            // Create the JWT AuthInfo instance
            const authInfo = await AuthInfo.create(username, jwtConfig);

            expect(authInfo.getConnectionOptions()).to.have.property('instanceUrl', jwtConfig.loginUrl);
        });

        //
        // Refresh token tests
        //

        it('should return a refresh token AuthInfo instance when passed a username and refresh token auth options', async () => {
            const username = 'authInfoTest_username_RefreshToken';
            const refreshTokenConfig = {
                refreshToken: testMetadata.refreshToken,
                loginUrl: testMetadata.loginUrl
            };
            const authResponse = {
                access_token: testMetadata.accessToken,
                instance_url: testMetadata.instanceUrl,
                id: '00DAuthInfoTest_orgId/005AuthInfoTest_userId'
            };

            // Stub the http request (OAuth2.refreshToken())
            _postParmsStub.returns(Promise.resolve(authResponse));

            // Create the refresh token AuthInfo instance
            const authInfo = await AuthInfo.create(username, refreshTokenConfig);

            // Verify the returned AuthInfo instance
            const authInfoJSON = authInfo.getConnectionOptions();
            expect(authInfoJSON).to.have.property('accessToken', authResponse.access_token);
            expect(authInfoJSON).to.have.property('instanceUrl', authResponse.instance_url);
            expect(authInfoJSON).to.not.have.property('refreshToken');
            expect(authInfoJSON['oauth2']).to.have.property('loginUrl', testMetadata.instanceUrl);
            expect(authInfoJSON['oauth2']).to.have.property('clientId', testMetadata.defaultConnectedAppInfo.clientId);
            expect(authInfoJSON['oauth2']).to.have.property('clientSecret', testMetadata.defaultConnectedAppInfo.clientSecret);
            expect(authInfoJSON['oauth2']).to.have.property('redirectUri', testMetadata.redirectUri);
            expect(authInfo.username).to.equal(username);
            expect(authInfo.authFileName).to.equal(`${username}.json`);
            expect(authInfo.isAccessTokenFlow(), 'authInfo.isAccessTokenFlow() should be false').to.be.false;
            expect(authInfo.isRefreshTokenFlow(), 'authInfo.isRefreshTokenFlow() should be true').to.be.true;
            expect(authInfo.isJwt(), 'authInfo.isJwt() should be false').to.be.false;
            expect(authInfo.isOauth(), 'authInfo.isOauth() should be true').to.be.true;

            // Verify authInfo.fields are encrypted
            const crypto = await Crypto.create();
            expect(crypto.decrypt(authInfo['fields'].accessToken)).equals(authResponse.access_token);
            expect(crypto.decrypt(authInfo['fields'].refreshToken)).equals(refreshTokenConfig.refreshToken);

            // Verify expected methods are called with expected args
            expect(AuthInfo.prototype.init['called']).to.be.true;
            expect(AuthInfo.prototype.init['firstCall'].args[0]).to.equal(refreshTokenConfig);
            expect(AuthInfo.prototype.update['called']).to.be.true;
            expect(AuthInfo.prototype['buildRefreshTokenConfig']['called']).to.be.true;
            expect(AuthInfo.prototype['buildRefreshTokenConfig']['firstCall'].args[0]).to.equal(refreshTokenConfig);

            const expectedAuthConfig = {
                accessToken: authResponse.access_token,
                instanceUrl: testMetadata.instanceUrl,
                orgId: authResponse.id.split('/')[0],
                loginUrl: refreshTokenConfig.loginUrl,
                refreshToken: refreshTokenConfig.refreshToken,
                clientId: testMetadata.defaultConnectedAppInfo.clientId,
                clientSecret: testMetadata.defaultConnectedAppInfo.clientSecret
            };
            expect(AuthInfo.prototype.update['firstCall'].args[0]).to.deep.equal(expectedAuthConfig);
        });

        it('should return a refresh token AuthInfo instance with custom clientId and clientSecret', async () => {
            const username = 'authInfoTest_username_RefreshToken_Custom';
            const refreshTokenConfig = {
                clientId: 'authInfoTest_clientId',
                clientSecret: 'authInfoTest_clientSecret',
                refreshToken: testMetadata.refreshToken,
                loginUrl: testMetadata.loginUrl
            };
            const authResponse = {
                access_token: testMetadata.accessToken,
                instance_url: testMetadata.instanceUrl,
                id: '00DAuthInfoTest_orgId/005AuthInfoTest_userId'
            };

            // Stub the http request (OAuth2.refreshToken())
            _postParmsStub.returns(Promise.resolve(authResponse));

            // Create the refresh token AuthInfo instance
            const authInfo = await AuthInfo.create(username, refreshTokenConfig);

            // Verify the returned AuthInfo instance
            const authInfoJSON = authInfo.getConnectionOptions();
            expect(authInfoJSON).to.have.property('accessToken', authResponse.access_token);
            expect(authInfoJSON).to.have.property('instanceUrl', authResponse.instance_url);
            expect(authInfoJSON).to.not.have.property('refreshToken');
            expect(authInfoJSON['oauth2']).to.have.property('loginUrl', testMetadata.instanceUrl);
            expect(authInfoJSON['oauth2']).to.have.property('clientId', refreshTokenConfig.clientId);
            expect(authInfoJSON['oauth2']).to.have.property('clientSecret', refreshTokenConfig.clientSecret);
            expect(authInfoJSON['oauth2']).to.have.property('redirectUri', testMetadata.redirectUri);
            expect(authInfo.username).to.equal(username);
            expect(authInfo.authFileName).to.equal(`${username}.json`);
            expect(authInfo.isAccessTokenFlow(), 'authInfo.isAccessTokenFlow() should be false').to.be.false;
            expect(authInfo.isRefreshTokenFlow(), 'authInfo.isRefreshTokenFlow() should be true').to.be.true;
            expect(authInfo.isJwt(), 'authInfo.isJwt() should be false').to.be.false;
            expect(authInfo.isOauth(), 'authInfo.isOauth() should be true').to.be.true;

            // Verify authInfo.fields are encrypted
            const crypto = await Crypto.create();
            expect(crypto.decrypt(authInfo['fields'].accessToken)).equals(authResponse.access_token);
            expect(crypto.decrypt(authInfo['fields'].refreshToken)).equals(refreshTokenConfig.refreshToken);
            expect(crypto.decrypt(authInfo['fields'].clientSecret)).equals(refreshTokenConfig.clientSecret);

            // Verify expected methods are called with expected args
            expect(AuthInfo.prototype.init['called']).to.be.true;
            expect(AuthInfo.prototype.init['firstCall'].args[0]).to.equal(refreshTokenConfig);
            expect(AuthInfo.prototype.update['called']).to.be.true;
            expect(AuthInfo.prototype['buildRefreshTokenConfig']['called']).to.be.true;
            expect(AuthInfo.prototype['buildRefreshTokenConfig']['firstCall'].args[0]).to.equal(refreshTokenConfig);

            const expectedAuthConfig = {
                accessToken: authResponse.access_token,
                instanceUrl: testMetadata.instanceUrl,
                orgId: authResponse.id.split('/')[0],
                loginUrl: refreshTokenConfig.loginUrl,
                refreshToken: refreshTokenConfig.refreshToken,
                clientId: refreshTokenConfig.clientId,
                clientSecret: refreshTokenConfig.clientSecret
            };
            expect(AuthInfo.prototype.update['firstCall'].args[0]).to.deep.equal(expectedAuthConfig);
        });

        it('should throw a RefreshTokenAuthError when auth fails via a refresh token', async () => {
            const username = 'authInfoTest_username_RefreshToken_ERROR';
            const refreshTokenConfig = {
                clientId: 'authInfoTest_clientId',
                clientSecret: 'authInfoTest_clientSecret',
                refreshToken: testMetadata.refreshToken,
                loginUrl: testMetadata.loginUrl
            };

            // Stub the http request (OAuth2.refreshToken())
            _postParmsStub.throws(new Error('authInfoTest_ERROR_MSG'));

            // Create the refresh token AuthInfo instance
            try {
                await AuthInfo.create(username, refreshTokenConfig);
                assert.fail('should have thrown an error within AuthInfo.buildRefreshTokenConfig()');
            } catch (err) {
                expect(err.name).to.equal('RefreshTokenAuthError');
            }
        });

        //
        // Web Auth (auth code) tests
        //

        it('should return a refresh token AuthInfo instance when passed an authcode', async () => {
            const username = 'authInfoTest_username_AuthCode';
            const authCodeConfig = {
                authCode: testMetadata.authCode,
                loginUrl: testMetadata.loginUrl
            };
            const authResponse = {
                access_token: testMetadata.accessToken,
                instance_url: testMetadata.instanceUrl,
                id: '00DAuthInfoTest_orgId/005AuthInfoTest_userId',
                refresh_token: testMetadata.refreshToken
            };

            // Stub the http requests (OAuth2.requestToken() and the request for the username)
            _postParmsStub.returns(Promise.resolve(authResponse));
            const responseBody = { body: JSON.stringify({ Username: username }) };
            $$.SANDBOX.stub(Transport.prototype, 'httpRequest').returns(Promise.resolve(responseBody));

            // Create the refresh token AuthInfo instance
            const authInfo = await AuthInfo.create(null, authCodeConfig);

            // Verify the returned AuthInfo instance
            const authInfoJSON = authInfo.getConnectionOptions();
            expect(authInfoJSON).to.have.property('accessToken', authResponse.access_token);
            expect(authInfoJSON).to.have.property('instanceUrl', authResponse.instance_url);
            expect(authInfoJSON).to.not.have.property('refreshToken');
            expect(authInfoJSON['oauth2']).to.have.property('loginUrl', testMetadata.instanceUrl); // why is this instanceUrl?
            expect(authInfoJSON['oauth2']).to.have.property('clientId', testMetadata.defaultConnectedAppInfo.clientId);
            expect(authInfoJSON['oauth2']).to.have.property('clientSecret', testMetadata.defaultConnectedAppInfo.clientSecret);
            expect(authInfoJSON['oauth2']).to.have.property('redirectUri', testMetadata.redirectUri);
            expect(authInfo.username).to.equal(username);
            expect(authInfo.authFileName).to.equal(`${username}.json`);
            expect(authInfo.isAccessTokenFlow(), 'authInfo.isAccessTokenFlow() should be false').to.be.false;
            expect(authInfo.isRefreshTokenFlow(), 'authInfo.isRefreshTokenFlow() should be true').to.be.true;
            expect(authInfo.isJwt(), 'authInfo.isJwt() should be false').to.be.false;
            expect(authInfo.isOauth(), 'authInfo.isOauth() should be true').to.be.true;

            // Verify authInfo.fields are encrypted
            const crypto = await Crypto.create();
            expect(crypto.decrypt(authInfo['fields'].accessToken)).equals(authResponse.access_token);
            expect(crypto.decrypt(authInfo['fields'].refreshToken)).equals(authResponse.refresh_token);

            // Verify expected methods are called with expected args
            expect(AuthInfo.prototype.init['called']).to.be.true;
            expect(AuthInfo.prototype.init['firstCall'].args[0]).to.equal(authCodeConfig);
            expect(AuthInfo.prototype.update['called']).to.be.true;
            expect(AuthInfo.prototype['buildWebAuthConfig']['called']).to.be.true;
            expect(AuthInfo.prototype['buildWebAuthConfig']['firstCall'].args[0]).to.equal(authCodeConfig);

            const expectedAuthConfig = {
                accessToken: authResponse.access_token,
                instanceUrl: testMetadata.instanceUrl,
                username,
                orgId: authResponse.id.split('/')[0],
                loginUrl: authCodeConfig.loginUrl,
                refreshToken: authResponse.refresh_token
            };
            expect(AuthInfo.prototype.update['firstCall'].args[0]).to.deep.equal(expectedAuthConfig);
        });

        it('should throw a AuthCodeExchangeError when auth fails via an auth code', async () => {
            const authCodeConfig = {
                authCode: testMetadata.authCode,
                loginUrl: testMetadata.loginUrl
            };

            // Stub the http request (OAuth2.requestToken())
            _postParmsStub.throws(new Error('authInfoTest_ERROR_MSG'));

            // Create the auth code AuthInfo instance
            try {
                await AuthInfo.create(null, authCodeConfig);
                assert.fail('should have thrown an error within AuthInfo.buildWebAuthConfig()');
            } catch (err) {
                expect(err.name).to.equal('AuthCodeExchangeError');
            }
        });

        it('should throw a AuthCodeUsernameRetrievalError when username retrieval fails after auth code exchange', async () => {
            const authCodeConfig = {
                authCode: testMetadata.authCode,
                loginUrl: testMetadata.loginUrl
            };
            const authResponse = {
                access_token: testMetadata.accessToken,
                instance_url: testMetadata.instanceUrl,
                id: '00DAuthInfoTest_orgId/005AuthInfoTest_userId',
                refresh_token: testMetadata.refreshToken
            };

            // Stub the http request (OAuth2.requestToken())
            _postParmsStub.returns(Promise.resolve(authResponse));
            $$.SANDBOX.stub(Transport.prototype, 'httpRequest').throws(new Error('authInfoTest_ERROR_MSG'));

            // Create the auth code AuthInfo instance
            try {
                await AuthInfo.create(null, authCodeConfig);
                assert.fail('should have thrown an error within AuthInfo.buildWebAuthConfig()');
            } catch (err) {
                expect(err.name).to.equal('AuthCodeUsernameRetrievalError');
            }
        });

        it('should throw an error when neither username nor options have been passed', async () => {
            try {
                await AuthInfo.create();
                assert.fail('Expected AuthInfo.create() to throw an error when no params are passed');
            } catch (err) {
                expect(err.name).to.equal('AuthInfoCreationError');
            }
        });
    });

    describe('save()', () => {
        it('should update the AuthInfo fields, cache, and write to file', async () => {
            const username = 'authInfoTest_username_SaveTest1';
            const refreshTokenConfig = {
                refreshToken: testMetadata.refreshToken,
                loginUrl: testMetadata.loginUrl
            };
            const authResponse = {
                access_token: testMetadata.accessToken,
                instance_url: testMetadata.instanceUrl,
                id: '00DAuthInfoTest_orgId/005AuthInfoTest_userId'
            };

            // Stub the http request (OAuth2.refreshToken())
            _postParmsStub.returns(Promise.resolve(authResponse));

            $$.SANDBOX.spy(AuthInfo['cache'], 'set');

            // Create the AuthInfo instance
            const authInfo = await AuthInfo.create(username, refreshTokenConfig);

            expect(authInfo.username).to.equal(username);

            // reset the AuthInfo.update stub so we only look at what happens with AuthInfo.save().
            AuthInfo.prototype.update['reset']();

            // Save new fields
            const changedData = { accessToken: testMetadata.accessToken };
            await authInfo.save(changedData);

            expect(AuthInfo.prototype.update['called']).to.be.true;
            expect(AuthInfo.prototype.update['firstCall'].args[0]).to.deep.equal(changedData);
            expect(AuthInfo['cache'].set['called']).to.be.true;
            expect(ConfigFile.prototype.write['called']).to.be.true;
            const writeCall = ConfigFile.prototype.write['firstCall'];
            expect(writeCall.thisValue.name).to.equal(`${username}.json`);

            const crypto = await Crypto.create();
            const decryptedActualFields = writeCall.args[0];
            decryptedActualFields.accessToken = crypto.decrypt(decryptedActualFields.accessToken);
            decryptedActualFields.refreshToken = crypto.decrypt(decryptedActualFields.refreshToken);
            const expectedFields = {
                accessToken: changedData.accessToken,
                instanceUrl: testMetadata.instanceUrl,
                username,
                orgId: authResponse.id.split('/')[0],
                loginUrl: refreshTokenConfig.loginUrl,
                refreshToken: refreshTokenConfig.refreshToken
            };
            // Note that this also verifies the clientId and clientSecret are not persisted,
            // and that data is encrypted when saved (because we have to decrypt it to verify here).
            expect(decryptedActualFields).to.deep.equal(expectedFields);
        });
    });

    describe('update()', () => {
        it('should encrypt the data before assigning to this.fields', async () => {
            const crypto = await Crypto.create();
            const context: any = {
                fields: {
                    accessToken: crypto.encrypt(testMetadata.accessToken),
                    instanceUrl: testMetadata.instanceUrl,
                    username: 'authInfoTest_updateTest',
                    orgId: '00DAuthInfoTest_orgId',
                    loginUrl: testMetadata.loginUrl,
                    refreshToken: crypto.encrypt(testMetadata.refreshToken)
                },
                logger: $$.TEST_LOGGER
            };
            const updatedFields = {
                password: 'authInfoTest_password',
                clientSecret: 'authInfoTest_updateTest_clientSecret',
                accessToken: 'authInfoTest_updateTest_ACCESS_TOKEN'
            };
            await AuthInfo.prototype.update.call(context, updatedFields);
            expect(crypto.decrypt(context.fields.accessToken)).to.equal(updatedFields.accessToken);
            expect(crypto.decrypt(context.fields.password)).to.equal(updatedFields.password);
            expect(crypto.decrypt(context.fields.clientSecret)).to.equal(updatedFields.clientSecret);
            expect(crypto.decrypt(context.fields.refreshToken)).to.equal(testMetadata.refreshToken);
            expect(context.fields.loginUrl).to.equal(testMetadata.loginUrl);
        });

        it('should NOT encrypt the data when encrypt arg is false', async () => {
            const context: any = {
                fields: {
                    accessToken: testMetadata.accessToken,
                    instanceUrl: testMetadata.instanceUrl,
                    username: 'authInfoTest_updateTest',
                    orgId: '00DAuthInfoTest_orgId',
                    loginUrl: testMetadata.loginUrl,
                    refreshToken: testMetadata.refreshToken
                },
                logger: $$.TEST_LOGGER
            };
            const updatedFields = {
                password: 'authInfoTest_password',
                clientSecret: 'authInfoTest_updateTest_clientSecret',
                accessToken: 'authInfoTest_updateTest_ACCESS_TOKEN'
            };
            await AuthInfo.prototype.update.call(context, updatedFields, false);
            expect(context.fields).to.deep.equal(Object.assign(context.fields, updatedFields));
        });
    });

    describe('refreshFn()', () => {
        it('should call init() and save()', async () => {
            const crypto = await Crypto.create();
            const context = {
                fields: {
                    loginUrl: testMetadata.loginUrl,
                    clientId: testMetadata.clientId,
                    privateKey: 'authInfoTest/jwt/server.key',
                    accessToken: testMetadata.encryptedAccessToken
                },
                init: $$.SANDBOX.stub(),
                save: $$.SANDBOX.stub(),
                logger: $$.TEST_LOGGER
            };
            const testCallback = $$.SANDBOX.stub();
            testCallback.returns(Promise.resolve());

            context.init.returns(Promise.resolve());
            context.save.returns(Promise.resolve());

            await AuthInfo.prototype['refreshFn'].call(context, null, testCallback);

            expect(context.init.called, 'Should have called AuthInfo.init() during refreshFn()').to.be.true;
            const expectedInitArgs = {
                loginUrl: context.fields.loginUrl,
                clientId: context.fields.clientId,
                privateKey: context.fields.privateKey,
                accessToken: testMetadata.accessToken
            };
            expect(context.init.firstCall.args[0]).to.deep.equal(expectedInitArgs);
            expect(context.save.called, 'Should have called AuthInfo.save() during refreshFn()').to.be.true;
            expect(testCallback.called, 'Should have called the callback passed to refreshFn()').to.be.true;
            expect(testCallback.firstCall.args[1]).to.equal(testMetadata.accessToken);
        });

        it('should call the callback with OrgDataNotAvailableError when AuthInfo.init() fails', async () => {
            const crypto = await Crypto.create();
            const context = {
                fields: {
                    loginUrl: testMetadata.loginUrl,
                    clientId: testMetadata.clientId,
                    privateKey: 'authInfoTest/jwt/server.key',
                    accessToken: testMetadata.encryptedAccessToken
                },
                init: $$.SANDBOX.stub(),
                save: $$.SANDBOX.stub(),
                logger: $$.TEST_LOGGER
            };
            const testCallback = $$.SANDBOX.spy();
            context.init.throws(new Error('Error: Data Not Available'));
            context.save.returns(Promise.resolve());

            await AuthInfo.prototype['refreshFn'].call(context, null, testCallback);
            expect(testCallback.called).to.be.true;
            const sfdxError = testCallback.firstCall.args[0];
            expect(sfdxError.name).to.equal('OrgDataNotAvailableError');
        });
    });

    describe('getAuthorizationUrl()', () => {
        it('should return the correct url', () => {
            const options = {
                clientId: testMetadata.clientId,
                redirectUri: testMetadata.redirectUri,
                loginUrl: testMetadata.loginUrl
            };
            const url: string = AuthInfo.prototype.getAuthorizationUrl.call(null, options);

            expect(url.startsWith(options.loginUrl), 'authorization URL should start with the loginUrl').to.be.true;
            expect(url).to.contain('state=');
            expect(url).to.contain('prompt=login');
            expect(url).to.contain('scope=refresh_token%20api%20web');
        });
    });

    describe('audienceUrl', () => {
        const sfdxAudienceUrlSetting = process.env.SFDX_AUDIENCE_URL;

        afterEach(() => {
            process.env.SFDX_AUDIENCE_URL = sfdxAudienceUrlSetting || '';
        });

        async function runTest(options, expectedUrl: string) {
            const context = {
                username: testMetadata.jwtUsername,
                logger: $$.TEST_LOGGER
            };
            const defaults = {
                clientId: testMetadata.clientId,
                loginUrl: testMetadata.loginUrl,
                privateKey: 'fake/pk'
            };
            Object.assign(defaults, options);
            const authResponse = {
                access_token: testMetadata.accessToken,
                instance_url: testMetadata.instanceUrl,
                id: '00DAuthInfoTest_orgId/005AuthInfoTest_userId'
            };

            // Stub file I/O, http requests, and the DNS lookup
            readFileStub.returns(Promise.resolve('audienceUrlTest_privateKey'));
            _postParmsStub.returns(Promise.resolve(authResponse));
            $$.SANDBOX.stub(jwt, 'sign').returns(Promise.resolve('audienceUrlTest_jwtToken'));
            $$.SANDBOX.stub(dns, 'lookup').returns(Promise.resolve());

            await AuthInfo.prototype['buildJwtConfig'].call(context, options);

            expect(jwt.sign['firstCall'].args[0]).to.have.property('aud', expectedUrl);
        }

        it('should use the correct audience URL for SFDX_AUDIENCE_URL env var', async () => {
            process.env.SFDX_AUDIENCE_URL = 'http://authInfoTest/audienceUrl/test';
            await runTest({}, process.env.SFDX_AUDIENCE_URL);
        });

        it('should use the correct audience URL for a sandbox', async () => {
            await runTest({ loginUrl: 'http://test.salesforce.com/foo/bar' }, 'https://test.salesforce.com');
        });

        it('should use the correct audience URL for an internal URL (.internal)', async () => {
            await runTest({ loginUrl: testMetadata.instanceUrl }, testMetadata.instanceUrl);
        });

        it('should use the correct audience URL for an internal URL (.vpod)', async () => {
            const vpodUrl = 'http://mydevhub.vpod.salesforce.com';
            await runTest({ loginUrl: vpodUrl }, vpodUrl);
        });

        it('should use the correct audience URL for an internal URL (.blitz)', async () => {
            const blitzUrl = 'http://mydevhub.blitz.salesforce.com';
            await runTest({ loginUrl: blitzUrl }, blitzUrl);
        });

        it('should use the correct audience URL for an internal URL (.stm)', async () => {
            const stmUrl = 'http://mydevhub.stm.salesforce.com';
            await runTest({ loginUrl: stmUrl }, stmUrl);
        });

        it('should use the correct audience URL for an internal URL (.mobile1)', async () => {
            const mobile1Url = 'http://mobile1.t.salesforce.com';
            await runTest({ loginUrl: mobile1Url }, mobile1Url);
        });

        it('should use the correct audience URL for createdOrgInstance beginning with "cs"', async () => {
            await runTest({ createdOrgInstance: 'cs17' }, 'https://test.salesforce.com');
        });

        it('should use the correct audience URL for createdOrgInstance beginning with "gs1"', async () => {
            await runTest({ createdOrgInstance: 'gs1' }, 'https://gs1.salesforce.com');
        });
    });

    describe('hasAuthentications', () => {
        it('should return false', async () => {
            $$.SANDBOX.stub(AuthInfo, 'listAllAuthFiles').callsFake(async (): Promise<string[]> => {
                return Promise.resolve([]);
            });

            const result: boolean = await AuthInfo.hasAuthentications();
            expect(result).to.be.false;
        });

        it('should return true', async () => {

            $$.SANDBOX.stub(AuthInfo, 'listAllAuthFiles').callsFake(async (): Promise<string[]> => {
                return Promise.resolve(['file1']);
            });

            const result: boolean = await AuthInfo.hasAuthentications();
            expect(result).to.be.equal(true);
        });
    });

    describe('listAllAuthFiles', () => {
        let files;
        beforeEach(() => {
            $$.SANDBOX.stub(SfdxUtil, 'readdir', () => Promise.resolve(files));
        });
        it('matches username', async () => {
            files = ['good@match.org.json'];
            const orgs = await AuthInfo.listAllAuthFiles();
            chai.expect(orgs[0]).equals(files[0]);
        });
        it('matches username with single char', async () => {
            files = ['a@match.org.json'];
            const orgs = await AuthInfo.listAllAuthFiles();
            chai.expect(orgs[0]).equals(files[0]);
        });
        it('matches username with periods', async () => {
            files = ['super.good@match.org.json'];
            const orgs = await AuthInfo.listAllAuthFiles();
            chai.expect(orgs[0]).equals(files[0]);
        });
        it('matches username with subdomain', async () => {
            files = ['good@sub.match.org.json'];
            const orgs = await AuthInfo.listAllAuthFiles();
            chai.expect(orgs[0]).equals(files[0]);
        });
        it('does not match hidden usernames', async () => {
            files = ['.no@match.org.json'];
            try {
                await AuthInfo.listAllAuthFiles();
                chai.assert.fail();
            } catch (e) {
                chai.expect(e.message).to.contain('No orgs can be found');
            }
        });
    });
});
