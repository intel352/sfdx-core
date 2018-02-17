/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root  or https://opensource.org/licenses/BSD-3-Clause
 */

// Thirdparty
import { expect } from 'chai';
import * as sinon from 'sinon';

// Local
import { KeyValueStore } from '../../lib/config/fileKeyValueStore';
import { Alias } from '../../lib/alias';
import { testSetup } from '../testSetup';

// Setup the test environment.
const $$ = testSetup();

describe('Alias', () => {
    let validate;
    const group = 'orgs';

    beforeEach(() => {
        validate = () => {};
        const stubMethod = (...args) => {
            validate(...args);
            return Promise.resolve();
        };

        // Stub the methods on the fileKeyValueStore
        $$.SANDBOX.stub(KeyValueStore.prototype, 'updateValues').callsFake(stubMethod);
        $$.SANDBOX.stub(KeyValueStore.prototype, 'remove').callsFake(stubMethod);
        $$.SANDBOX.stub(KeyValueStore.prototype, 'update').callsFake(stubMethod);
        $$.SANDBOX.stub(KeyValueStore.prototype, 'unset').callsFake(stubMethod);
        $$.SANDBOX.stub(KeyValueStore.prototype, 'fetch').callsFake(stubMethod);
        $$.SANDBOX.stub(KeyValueStore.prototype, 'list').callsFake(stubMethod);
        $$.SANDBOX.stub(KeyValueStore.prototype, 'byValue').callsFake(stubMethod);
    });

    describe('#update', () => {
        it('passes the correct values to FileKeyValueStore#update', async () => {
            const key = 'test';
            const value = 'val';
            validate = (...args) => {
                expect(args[0]).to.equal(key);
                expect(args[1]).to.equal(value);
                expect(args[2]).to.equal(group);
            };
            await Alias.update(key, value);
            expect(sinon.assert.calledOnce(KeyValueStore.prototype.update));
        });
    });

    describe('#unset', () => {
        it('passes the correct values to FileKeyValueStore#unset', async () => {
            const keyArray = ['test1', 'test3'];
            validate = (...args) => {
                expect(args[0]).to.deep.equal(keyArray);
                expect(args[1]).to.equal(group);
            };
            await Alias.unset(keyArray);
            expect(sinon.assert.calledOnce(KeyValueStore.prototype.unset));
        });
    });

    describe('#parseAndSet', () => {
        describe('passes the right values to FileKeyValueStore#updateValues', () => {
            it('for one value', async () => {
                validate = (...args) => {
                    expect(args[0]).to.deep.equal({
                        another: 'val'
                    });
                    expect(args[1]).to.equal(group);
                };
                await Alias.parseAndUpdate(['another=val']);
                expect(sinon.assert.calledOnce(KeyValueStore.prototype.updateValues));
            });

            it('for two of same value', async () => {
                validate = (...args) => {
                    expect(args[0]).to.deep.equal({
                        another: 'val',
                        some: 'val'
                    });
                    expect(args[1]).to.equal(group);
                };
                await Alias.parseAndUpdate(['another=val', 'some=val']);
                expect(sinon.assert.calledOnce(KeyValueStore.prototype.updateValues));
            });
        });

        it('should handle invalid alias formats', async () => {
            const invalidFormats = ['another', 'foo==bar'];
            for (const element of invalidFormats) {
                try {
                    await Alias.parseAndUpdate([element]);
                } catch (err) {
                    if (err.name === 'AssertionError') {
                        throw err;
                    }
                    expect(err.name).to.equal('InvalidFormat');
                }
            }
        });
    });
});
