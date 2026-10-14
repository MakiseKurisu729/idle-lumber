import { _decorator, Component, Node, Vec3, Prefab, tween, Tween, CCFloat } from 'cc';
import { PlayerController } from '../player/PlayerController';
import { GameManager } from '../core/GameManager';
import { NodePool } from '../core/NodePool';

const { ccclass, property } = _decorator;

/**
 * 金币区：卡车开走后吐出金币（从中间涌出再散开到 2×2 格子），
 * 玩家靠近时从栈顶（最上层）逐个捡上背。
 * 金币位置由背包统一安排，这里只管生成动画和拾取。
 */
@ccclass('CoinZone')
export class CoinZone extends Component {

    @property({ type: PlayerController })
    player: PlayerController = null!;

    @property({ type: Prefab, tooltip: '金币预制体' })
    coinPrefab: Prefab = null;

    @property({ type: CCFloat })
    pickupRange: number = 2;

    @property({ type: CCFloat })
    pickupInterval: number = 0.08;

    private _coins: Node[] = [];
    private _pickupTimer: number = 0;

    /** TruckZone 调用：生成 n 枚金币，从底下中间涌出来再散开到 2×2 格子 */
    spawnCoins(n: number) {
        if (!this.coinPrefab) {
            console.error('[CoinZone] 没有设置 coinPrefab');
            return;
        }
        for (let i = 0; i < n; i++) {
            const coin = NodePool.get(this.coinPrefab);
            coin.setParent(this.node);
            coin.setPosition(0, 0.05, 0);            // 全部从底下中间开始
            this._coins.push(coin);

            const target = this._gridPos(i);
            const risePos = new Vec3(0, 1.2, 0);     // 先往上冒到这个高度

            tween(coin)
                .delay(i * 0.05)                     // 一枚接一枚涌出
                .to(0.15, { position: risePos }, { easing: 'quadOut' })
                .to(0.25, { position: target }, { easing: 'bounceOut' })
                .start();
        }
    }

    update(dt: number) {
        if (!this.player || !this.player.node || !this.player.node.isValid) return;
        if (!this.player.backpack) return;

        const dist = Vec3.distance(this.player.node.worldPosition, this.node.worldPosition);
        if (dist <= this.pickupRange && this._coins.length > 0) {
            this._pickupTimer += dt;
            if (this._pickupTimer >= this.pickupInterval) {
                this._pickupTimer = 0;
                this._pickupCoin();
            }
        } else {
            this._pickupTimer = 0;
        }
    }

    private _pickupCoin() {
        if (this._coins.length === 0) return;

        const backpack = this.player.backpack;
        if (!backpack.canAddCoin()) return;   // 背上满了（两种物品），捡不了金币

        const coin = this._coins.pop()!;   // 从栈顶取（最上层的先飞）

        // 关键：掐掉可能还没播完的生成动画，防止两个 tween 抢 position
        Tween.stopAllByTarget(coin);

        const carryPoint = backpack.carryPoint;
        const carryWorld = new Vec3();
        carryPoint.getWorldPosition(carryWorld);

        tween(coin)
            .to(0.25, { worldPosition: carryWorld }, { easing: 'quadIn' })
            .call(() => {
                coin.setParent(carryPoint);
                backpack.addCoin(coin);   // 位置/旋转由背包统一安排
                if (GameManager.instance) GameManager.instance.syncCoins(backpack.coinCount);
            })
            .start();
    }

    /** 金币摆放：2×2 一层，放满 4 枚往上叠一层 */
    private _gridPos(i: number): Vec3 {
        const spacing = 0.5;     // 同层内金币间距
        const layerH = 0.25;     // 每层高
        const baseY = 0.3;       // 第一层高度

        const layer = Math.floor(i / 4);
        const idx = i % 4;
        const col = idx % 2;
        const row = Math.floor(idx / 2);

        return new Vec3(
            (col - 0.5) * spacing,
            baseY + layer * layerH,
            (row - 0.5) * spacing
        );
    }
}
