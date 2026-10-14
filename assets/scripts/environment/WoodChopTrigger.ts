import { _decorator, Component, Node, Vec3, Collider, ITriggerEvent, Prefab, tween, director, CCFloat } from 'cc';
import { FloatingWood, WoodState } from './FloatingWood';
import { Backpack } from '../player/Backpack';
import { FlyingWoodAnim } from './FlyingWoodAnim';
import { NodePool } from '../core/NodePool';

const { ccclass, property } = _decorator;

/**
 * 砍伐触发器：挂在漂木子节点的 Trigger Collider 上。
 * 玩家进入范围 → 木头变为可砍 → 按冷却自动挥斧 → 砍倒后爆出 6 根原木自己飞上背。
 */
@ccclass('WoodChopTrigger')
export class WoodChopTrigger extends Component {

    @property({ type: CCFloat })
    chopCooldown: number = 0.5;

    @property({ type: Prefab, tooltip: '原木预制体（砍倒后爆出来的那种）' })
    woodPickupPrefab: Prefab = null;

    private _timer: number = 0;
    private _player: Node = null;

    onLoad() {
        const collider = this.getComponent(Collider);
        if (collider) {
            collider.on('onTriggerEnter', this._onEnter, this);
            collider.on('onTriggerExit', this._onExit, this);
        }
    }

    update(dt: number) {
        if (this._timer > 0) this._timer -= dt;
        if (this._timer <= 0 && this._player) {
            this._tryChop();
        }
    }

    private _onEnter(event: ITriggerEvent) {
        const otherNode = event.otherCollider.node;
        if (otherNode.getComponent('PlayerController')) {
            this._player = otherNode;
            const floatingWood = this.node.parent.getComponent(FloatingWood);
            if (floatingWood) floatingWood.setState(WoodState.CHOPPABLE);
        }
    }

    private _onExit(event: ITriggerEvent) {
        const otherNode = event.otherCollider.node;
        if (otherNode === this._player) {
            this._player = null;
            const floatingWood = this.node.parent.getComponent(FloatingWood);
            if (floatingWood) floatingWood.setState(WoodState.FLOATING);
        }
    }

    private _tryChop() {
        const floatingWood = this.node.parent.getComponent(FloatingWood);
        if (!floatingWood || floatingWood.state !== WoodState.CHOPPABLE) return;

        this._timer = this.chopCooldown;

        const playerCtrl = this._player?.getComponent('PlayerController') as any;
        if (playerCtrl) playerCtrl.playChop();

        // 延迟 400ms，等动画播完再扣血
        setTimeout(() => {
            // 节点可能已被销毁，先防守
            if (!this.node || !this.node.isValid) return;

            const woodNode = this.node.parent;
            if (!woodNode || !woodNode.isValid) return;
            if (!floatingWood || !(floatingWood as any).isValid) return;
            if (floatingWood.state !== WoodState.CHOPPABLE) return;

            const destroyed = floatingWood.chop(playerCtrl ? playerCtrl.chopDamage : 1);

            if (destroyed) {
                const woodPos = woodNode.worldPosition.clone();
                const player = this._player;

                tween(woodNode)
                    .to(0.2, { scale: new Vec3(0.01, 0.01, 0.01) })
                    .call(() => { if (woodNode.isValid) woodNode.destroy(); })
                    .start();

                setTimeout(() => {
                    this._spawnWoods(woodPos, player);
                }, 150);
            }
        }, 400);
    }

    /** 生成 6 个木材，各自挂 FlyingWoodAnim 自己飞上玩家的背 */
    private _spawnWoods(startPos: Vec3, player: Node) {
        if (!this.woodPickupPrefab || !player || !player.isValid) return;

        const backpack = player.getComponent(Backpack);
        if (!backpack) return;
        if (!backpack.canAddType('RawWood_')) return;   // 背包装不下原木，不生成
        const carryPoint = backpack.carryPoint || player;
        const scene = director.getScene();

        // 关键：索引 = 背包现有数 + 在途数，并先把 6 个坑占掉
        // 这样砍得再快，两批木头的堆叠索引也不会撞车
        const baseIndex = backpack.count + backpack.incoming;
        backpack.reserveIncoming(6);

        for (let i = 0; i < 6; i++) {
            const newWood = NodePool.get(this.woodPickupPrefab);
            newWood.name = `RawWood_${Date.now()}_${i}_${Math.floor(Math.random() * 10000)}`;
            newWood.setParent(scene);
            newWood.setPosition(startPos);

            // 挂飞行组件，自己管理飞行（池里复用的节点可能已有该组件）
            const anim = newWood.getComponent(FlyingWoodAnim) || newWood.addComponent(FlyingWoodAnim);
            anim.init(
                startPos,           // 起点
                baseIndex + i,      // 目标堆叠索引（先占坑，不会撞）
                player,             // 玩家（实时追踪）
                carryPoint,         // 背部挂点
                backpack,           // 背包
                i * 0.08            // 延迟
            );
        }
    }
}
