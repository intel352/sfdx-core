/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root  or https://opensource.org/licenses/BSD-3-Clause
 */
import * as _ from 'lodash';
import { ConfigValue, ConfigEntry, ConfigContents } from './configStore';
import { ConfigFile, ConfigOptions } from './configFile';

export interface ConfigGroupOptions extends ConfigOptions {
    defaultGroup: string;
}

/**
 * A config file that stores config values in groups. e.g. to store different config
 * values for different commands, without having manually manipulate the config.
 *
 * **Note:** All config methods are overwritten to use the {@link ConfigGroup.setDefaultGroup}.
 *
 * @extends ConfigFile
 *
 * @example
 * class MyPluginConfig extents ConfigGroup {
 *     class MyConfig extents ConfigFile {
 *     public static getFileName(): string {
 *         return 'myPluginConfigFilename.json';
 *     }
 * }
 * const myConfig = await MyPluginConfig.retrieve<MyPluginConfig>(ConfigGroup.getOptions('all'));
 * myconfig.setDefaultGroup('myCommand'); // Can be set in your command's init.
 * myConfig.set('mykey', 'myvalue'); // Sets 'myKey' for the 'myCommand' group.
 * myConfig.setInGroup('myKey', 'myvalue', 'all'); // Manually set in another group.
 * await myconfig.write();
 */
export class ConfigGroup extends ConfigFile {

    /**
     * Overrides {@link ConfigFile.read}.
     * @override // Doesn't work for static methods
     */
    public static async create<T extends ConfigFile>(options: ConfigOptions): Promise<T> {
        const config: T = (await super.create(options)) as T;
        // First cast T to config file, before we can cast to ConfigGroup
        const group: ConfigGroup = (config as ConfigFile) as ConfigGroup;
        group.setDefaultGroup((options as ConfigGroupOptions).defaultGroup);
        return config;
    }

    /**
     * Get ConfigGroup specific options, such as the default group.
     * @param defaultGroup The default group to use when creating the config.
     * @param filename The filename of the config file. Uses the static {@link getFileName} by default.
     */
    public static getOptions(defaultGroup: string, filename?: string): ConfigGroupOptions {
        const options: ConfigGroupOptions = this.getDefaultOptions(true, filename) as ConfigGroupOptions;
        options.defaultGroup = defaultGroup;
        return options;
    }

    private defaultGroup: string = 'default';

    /**
     * Sets the default group for all {@link BaseConfigStore} methods to use.
     * @param {String} group The group.
     */
    public setDefaultGroup(group: string): void {
        this.defaultGroup = group;
    }

    /**
     * Set a group of entries in a bulk save.
     * @param {object} keyAndValues An object representing the aliases to set.
     * @param {string} group The group the property belongs to. Defaults to 'default'.
     * @returns {Promise<object>} The new property that was saved.
     */
    public async updateValues(newEntries: object, group?: string): Promise<object> {
        // Make sure the contents are loaded
        await this.read();
        _.forEach(newEntries, (val, key) => this.setInGroup(key, val, group || this.defaultGroup));
        await this.write();
        return newEntries;
    }

    /**
     * Set a value on a group.
     * @param {string} key The key.
     * @param {string} property The value.
     * @param {string} group The group. Defaults to 'default'.
     * @returns {Promise<void>} The promise resolved when the value is set.
     */
    public async updateValue(key: string, value: ConfigValue, group?: string): Promise<void> {
        // Make sure the content is loaded
        await this.read();
        this.setInGroup(key, value, group || this.defaultGroup);
        // Then save it
        await this.write();
    }

    public entries(): ConfigEntry[] {
        return Array.from(this.getGroup(this.defaultGroup).entries());
    }

    public get(key: string): ConfigValue { // tslint:disable-next-line no-reserved-keywords
        return this.getInGroup(key);
    }

    public has(key: string): boolean {
        return this.getContents().has(this.defaultGroup) &&
            (this.getContents().get(this.defaultGroup) as ConfigContents).has(key);
    }

    public keys(): string[] {
        return Array.from((this.getGroup(this.defaultGroup).keys()));
    }

    public values(): ConfigValue[] {
        return Array.from((this.getGroup(this.defaultGroup).values()));
    }

    public set(key: string, value: ConfigValue) { // tslint:disable-next-line no-reserved-keywords
        if (!this.getContents().has(this.defaultGroup)) {
            this.getContents().set(this.defaultGroup, new Map<string, ConfigValue>());
        }
        const contents = this.getContents().get(this.defaultGroup) as ConfigContents;
        contents.set(key, value);
        return contents;
    }

    public unset(key: string): boolean {
        const groupContents = this.getGroup(this.defaultGroup);
        if (groupContents) {
            return groupContents.delete(key);
        }
        return;
    }

    public clear(): void {
        this.getContents().delete(this.defaultGroup);
    }

    /**
     * Get all config content for a group.
     * @param {string} group The group.
     * @returns {ConfigContent} The contents.
     */
    public getGroup(group?: string): ConfigContents {
        return this.getContents().get(group || this.defaultGroup) as ConfigContents;
    }

    /**
     * Returns the value associated to the key and group, or undefined if there is none.
     * @param {string} key The key.
     * @param {string} group The group. Defaults to the default group.
     * @returns {ConfigValue}
     */
    public getInGroup(key: string, group?: string): ConfigValue {
        const groupContents = this.getGroup(group);
        if (groupContents) {
            return groupContents.get(key);
        }
        return;
    }

    /**
     * Convert the config object to a json object.
     * @returns {object}
     * @override
     */
    public toObject(): object {
        return _.entries(this.getContents()).reduce((obj, entry: ConfigEntry) => {
            obj[entry[0]] = _.entries(entry[1] as ConfigContents).reduce((subobj, subentry: ConfigEntry) => {
                subobj[subentry[0]] = subentry[1];
                return subobj;
            }, {});
            return obj;
        }, {});
    }

    /**
     * Convert a json object to a ConfigContents and set it as the config contents.
     * @param {object} obj The object.
     */
    public setContentsFromObject(obj: object): void {
        const contents = new Map<string, ConfigValue>(_.entries(obj));
        _.entries(contents).forEach(([key, value]) => {
            contents.set(key, new Map<string, ConfigValue>(_.entries(value)));
        });
        this.setContents(contents);
    }

    /**
     * Sets the value for the key and group in the config object.
     * @param key The key.
     * @param value The value.
     * @param group The group. Defaults to the default group.
     * @returns {ConfigContents}
     */
    public setInGroup(key: string, value?: ConfigValue, group?: string) {
        let content: ConfigContents = this.getContents();

        group = group || this.defaultGroup;

        if (!content.has(group)) {
            content.set(group, new Map<string, ConfigValue>());
        }

        content = content.get(group) as ConfigContents;

        if (_.isUndefined(value)) {
            content.delete(key);
        } else {
            content.set(key, value);
        }

        return content;
    }
}
