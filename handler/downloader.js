import {WebSiteDownloader} from '../handler/webSiteDownloader.js'
import {DarwinDownloader} from '../handler/darwinDownloader.js'
import {log} from '../common/log4jscf.js'
import {sleep} from "../common/utils.js";
import { CustomError } from '../common/error.js';

class DownloaderFactory {

    constructor() {
        this.downloaders = []
    }


    /**
     * 创建一个工厂类
     * @param type
     * @returns {DownloaderFactory}
     */
    static create() {
        return new DownloaderFactory()
    }

    /**
     * 登录操作
     * @param target 当前对象
     * @param type 要登录的目标
     * @returns
     */
    async _login(type) {
        if (type == null) {
            this.downloaders.push({
                isLimit: false,
                downloader: new WebSiteDownloader()
            })
            this.downloaders.push({
                isLimit: false,
                downloader: new DarwinDownloader()
            })
        } else if (type == 'pc') {
            this.downloaders.push({
                isLimit: false,
                downloader: new DarwinDownloader()
            })
        } else if (type == 'web') {
            this.downloaders.push({
                isLimit: false,
                downloader: new WebSiteDownloader()
            })
        } else {
            throw new Error(`暂不支持: ${type} 这种登录方式`)
        }
        for (const index in this.downloaders) {
            const item = this.downloaders[index]
            const downloader = item.downloader
            const isLogin = await downloader.isLogin()
            if (isLogin) {
                continue
            }
            log.info(`登录${downloader.deviceType}中...`)
            await downloader.login()
        }
    }


    async _getItem(downloads) {
        for (let i = downloads.length - 1; i >= 0; i--) {
            let item = downloads[i]
            if (item.isLimit) {
                continue
            }
            let max = Math.floor(100 / (downloads.length - i))
            while (await item.executeCounter.get() < max) {
                await sleep(80)
                await item.executeCounter.increment()
                return item
            }
        }
        for (const download of downloads) {
            await download.executeCounter.set(0);
        }
        const _downloads = downloads.filter(download => download.isLimit == false)
        if (_downloads.length == 0) {
            return null
        }
        return downloads[downloads.length - 1]
    }

    /**
     * 回调中获取下载器
     * @param type
     * @param cb
     * @returns {Promise<*>}
     */
    async getDownloader(type, cb) {

        if (this.downloaders.length == 0) {
            await this._login(type)
        }
        let limitedFlag = 0
        for (let i = 0; i < this.downloaders.length; i++) {
            //const item = _getRandomItem(downloads)
            const item = this.downloaders[i]
            if (item.isLimit) {
                continue
            }
            try {
                return await cb(item.downloader)
            } catch (error) {
                if (error instanceof CustomError) {
                    if (error.code == 999) {
                        item.isLimit = true
                        limitedFlag += 1
                    }
                    // 疑似会员过期问题预期表现：跳到下一本书继续下载
                }
                continue
            }
        }
        this.downloaders.forEach(downloader => {
            downloader.isLimit = false
        })
        if (limitedFlag >= this.downloaders.length) {
            throw new CustomError(999, `所有下载方式都受限了，约一小时后自动重试`)
        } else {
            throw new CustomError(666, "无可下载数据，检查会员是否过期")
        }
    }
}

export {
    DownloaderFactory
}