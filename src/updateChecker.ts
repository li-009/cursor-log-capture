import * as vscode from 'vscode';
import * as https from 'https';

/**
 * 自动更新检查器
 * 检查 GitHub Release 是否有新版本
 */
export class UpdateChecker {
    private static readonly GITHUB_REPO = 'li-009/cursor-log-capture';
    private static readonly RELEASES_URL = `https://api.github.com/repos/${UpdateChecker.GITHUB_REPO}/releases/latest`;
    private static readonly DOWNLOAD_URL = `https://github.com/${UpdateChecker.GITHUB_REPO}/releases/latest`;
    
    private currentVersion: string;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // 从 package.json 获取当前版本
        const extension = vscode.extensions.getExtension('your-name.cursor-log-capture');
        this.currentVersion = extension?.packageJSON?.version || '2.0.0';
    }

    /**
     * 检查更新（启动时自动调用）
     */
    async checkForUpdates(silent: boolean = false): Promise<void> {
        try {
            const latestRelease = await this.getLatestRelease();
            
            if (!latestRelease) {
                if (!silent) {
                    vscode.window.showInformationMessage('无法检查更新，请检查网络连接');
                }
                return;
            }

            const latestVersion = latestRelease.tag_name.replace(/^v/, '');
            
            if (this.isNewerVersion(latestVersion, this.currentVersion)) {
                // 有新版本
                this.showUpdateNotification(latestVersion, latestRelease);
            } else if (!silent) {
                vscode.window.showInformationMessage(`✅ 已是最新版本 v${this.currentVersion}`);
            }

            // 保存上次检查时间
            this.context.globalState.update('lastUpdateCheck', Date.now());

        } catch (error: any) {
            console.error('检查更新失败:', error);
            if (!silent) {
                vscode.window.showErrorMessage(`检查更新失败: ${error.message}`);
            }
        }
    }

    /**
     * 显示更新通知
     */
    private async showUpdateNotification(newVersion: string, release: GitHubRelease): Promise<void> {
        const message = `🎉 Log Capture 有新版本 v${newVersion} 可用！当前版本: v${this.currentVersion}`;
        
        const selection = await vscode.window.showInformationMessage(
            message,
            '📥 立即下载',
            '📋 查看更新内容',
            '稍后提醒'
        );

        switch (selection) {
            case '📥 立即下载':
                // 打开下载页面
                vscode.env.openExternal(vscode.Uri.parse(UpdateChecker.DOWNLOAD_URL));
                break;
            
            case '📋 查看更新内容':
                // 显示更新日志
                this.showReleaseNotes(release);
                break;
            
            case '稍后提醒':
                // 记录跳过的版本，24小时后再提醒
                this.context.globalState.update('skippedVersion', newVersion);
                this.context.globalState.update('skipUntil', Date.now() + 24 * 60 * 60 * 1000);
                break;
        }
    }

    /**
     * 显示更新日志
     */
    private async showReleaseNotes(release: GitHubRelease): Promise<void> {
        const content = `# ${release.name || release.tag_name}\n\n${release.body || '暂无更新说明'}\n\n---\n\n[点击下载](${release.html_url})`;
        
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'markdown'
        });
        
        await vscode.window.showTextDocument(doc, { preview: true });
    }

    /**
     * 获取最新 Release 信息
     */
    private getLatestRelease(): Promise<GitHubRelease | null> {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path: `/repos/${UpdateChecker.GITHUB_REPO}/releases/latest`,
                method: 'GET',
                headers: {
                    'User-Agent': 'cursor-log-capture-extension',
                    'Accept': 'application/vnd.github.v3+json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const release = JSON.parse(data);
                            resolve(release);
                        } catch {
                            resolve(null);
                        }
                    } else if (res.statusCode === 404) {
                        // 还没有 Release
                        resolve(null);
                    } else {
                        resolve(null);
                    }
                });
            });

            req.on('error', (e) => {
                console.error('请求失败:', e);
                resolve(null);
            });

            req.setTimeout(10000, () => {
                req.destroy();
                resolve(null);
            });

            req.end();
        });
    }

    /**
     * 比较版本号
     */
    private isNewerVersion(latest: string, current: string): boolean {
        const latestParts = latest.split('.').map(Number);
        const currentParts = current.split('.').map(Number);

        for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
            const latestPart = latestParts[i] || 0;
            const currentPart = currentParts[i] || 0;

            if (latestPart > currentPart) return true;
            if (latestPart < currentPart) return false;
        }

        return false;
    }

    /**
     * 是否应该检查更新
     */
    shouldCheckUpdate(): boolean {
        // 检查是否跳过了当前版本
        const skipUntil = this.context.globalState.get<number>('skipUntil');
        if (skipUntil && Date.now() < skipUntil) {
            return false;
        }

        // 每6小时检查一次
        const lastCheck = this.context.globalState.get<number>('lastUpdateCheck');
        if (lastCheck) {
            const sixHours = 6 * 60 * 60 * 1000;
            if (Date.now() - lastCheck < sixHours) {
                return false;
            }
        }

        return true;
    }
}

/**
 * GitHub Release 接口
 */
interface GitHubRelease {
    tag_name: string;
    name: string;
    body: string;
    html_url: string;
    published_at: string;
    assets: {
        name: string;
        browser_download_url: string;
        size: number;
    }[];
}

