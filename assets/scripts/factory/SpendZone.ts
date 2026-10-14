import { _decorator, Component, Node, Vec3, tween, CCFloat, Prefab, instantiate } from 'cc';
import { PlayerController } from '../player/PlayerController';
import { GameManager } from '../core/GameManager';
import { DropZone } from './DropZone';
import { Worker } from './Worker';
import { NodePool } from '../core/NodePool';

const { ccclass, property } = _decorator;

/**
 * 消费区：玩家站进来，背上的金币逐枚飞向目标点并花掉。
 * 花满 upgradePrice 后按优先级触发升级：
 *   1. 填了 workerPrefab → 雇佣一个工人（可重复，进度清零，区域不隐藏）
 *   2. 填了 revealNode   → 显示该节点（网、传送带等）
 *   3. 都没填             → 升级玩家电锯
 */
@ccclass('SpendZone')
export class SpendZone extends Component {

    @property({ type: PlayerController })
    player: PlayerController = null!;

    @property({ type: CCFloat })
    spendRange: number = 2;

    @property({ type: CCFloat, tooltip: '每多少秒花掉一枚金币' })
    spendInterval: number = 0.08;

    @property({ type: Node, tooltip: '金币飞去的落点（不填就落在区域中心）' })
    targetPoint: Node = null;

    @property({ type: CCFloat, tooltip: '升级价格（要花掉多少枚金币）' })
    upgradePrice: number = 50;

    @property({ type: Node, tooltip: '升级后要显示的节点（比如网、传送带）。都不填 = 升级玩家电锯' })
    revealNode: Node = null;

    @property({ type: Prefab, tooltip: '工人预制体。填了它 = 雇佣工人模式，revealNode 会被忽略' })
    workerPrefab: Prefab = null;

    @property({ type: Node, tooltip: '升级图标节点（可选），会随投入进度逐渐变大' })
    iconNode: Node = null;

    @property({ tooltip: '升级完成后是否隐藏自己' })
    hideAfterUpgrade: boolean = true;

    @property({ type: DropZone, tooltip: '工人砍完的原木送去哪个放置区（雇佣工人模式必填）' })
    workerDropZone: DropZone = null;

    private _spendTimer: number = 0;
    private _spent: number = 0;
    private _upgraded: boolean = false;

    start() {
        // 初始隐藏目标（比如网先藏起来）
        if (this.revealNode) this.revealNode.active = false;
        // 图标初始为 50% 大小
        if (this.iconNode) this.iconNode.setScale(0.5, 0.5, 0.5);
    }

    update(dt: number) {
        if (this._upgraded) return;
        if (!this.player || !this.player.node || !this.player.node.isValid) return;
        if (!this.player.backpack) return;

        const dist = Vec3.distance(this.player.node.worldPosition, this.node.worldPosition);
        if (dist <= this.spendRange && this.player.backpack.coinCount > 0) {
            this._spendTimer += dt;
            if (this._spendTimer >= this.spendInterval) {
                this._spendTimer = 0;
                this._spendOne();
            }
        } else {
            this._spendTimer = 0;
        }
    }

    private _spendOne() {
        const coin = this.player.backpack.takeCoin();
        if (!coin) return;

        const target = this.targetPoint ? this.targetPoint.worldPosition.clone()
            : this.node.worldPosition.clone();
        target.y += 0.5;

        const startWorld = coin.worldPosition.clone();
        coin.setParent(this.node);
        coin.setWorldPosition(startWorld);

        tween(coin)
            .to(0.2, { worldPosition: target }, { easing: 'quadIn' })
            .call(() => {
                NodePool.put(coin);
                // UI 直接按背包实际数量刷新
                if (GameManager.instance) GameManager.instance.syncCoins(this.player.backpack.coinCount);

                this._spent++;

                // 图标从 50% 大小随进度长到 100%
                if (this.iconNode) {
                    const s = 0.5 + 0.5 * (this._spent / this.upgradePrice);
                    this.iconNode.setScale(s, s, s);
                }

                if (!this._upgraded && this._spent >= this.upgradePrice) {
                    this._upgraded = true;
                    this._onUpgradeComplete();
                }
            })
            .start();
    }

    /** 升级完成：雇佣工人 > 显示节点 > 升级电锯 */
    private _onUpgradeComplete() {
        // 雇佣工人：可重复，进度清零，区域不隐藏
        if (this.workerPrefab) {
            const worker = instantiate(this.workerPrefab);
            worker.setParent(this.node.parent || this.node);
            const pos = this.node.worldPosition.clone();
            pos.x += 1;
            worker.setWorldPosition(pos);

            // 关键：预制体里存不了场景节点引用，生成时把放置区注入给工人
            const w = worker.getComponent(Worker);
            if (w) w.dropZone = this.workerDropZone;

            this._spent = 0;
            this._upgraded = false;
            if (this.iconNode) this.iconNode.setScale(0.5, 0.5, 0.5);
            return;
        }

        if (this.revealNode) {
            this.revealNode.active = true;
        } else {
            this.player.upgradeToChainsaw();
        }

        if (this.hideAfterUpgrade) this.node.active = false;
    }
}
