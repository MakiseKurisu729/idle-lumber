import { _decorator, Component, Node, Vec3, RigidBody, Collider, ICollisionEvent, CCFloat } from 'cc';

const { ccclass, property } = _decorator;

export enum WoodState {
    FLOATING,   // 水上漂
    CHOPPABLE,  // 可砍（玩家/工人进入砍伐范围）
    DROPPED,    // 已掉落/不再漂
}

/**
 * 漂浮木头：沿河漂流，可被玩家/工人砍伐。
 *
 * 物理约定：动态刚体但 useGravity=false、angularDamping 拉满、大质量，
 * 移动全部通过 setLinearVelocity 驱动，避免物理引擎自己乱滚。
 *
 * 阻挡规则：撞到静态碰撞体停住；玩家只有正面挡在漂流方向上（约 30° 扇形）才停，侧面擦过不停。
 */
@ccclass('FloatingWood')
export class FloatingWood extends Component {

    @property({ type: CCFloat })
    floatSpeed: number = 1.5;

    @property({ tooltip: '漂流方向' })
    flowDirection: Vec3 = new Vec3(0, 0, 1);

    @property({ type: CCFloat, tooltip: '木头的血量（斧头砍 2 刀，电锯砍 1 刀）' })
    hp: number = 2;

    @property({ type: CCFloat, tooltip: '木头世界坐标 x 超过这个值就销毁' })
    despawnX: number = 15;

    /** 锁定这根木头的工人（同时只许一个工人盯） */
    public claimedBy: any = null;

    private _rb: RigidBody = null;
    private _state: WoodState = WoodState.FLOATING;
    private _hp: number = 2;

    /** 撞到的静态碰撞体数量（>0 就停住） */
    private _blockCount: number = 0;

    /** 接触中的玩家（动态刚体，只记录，由方向判断决定停不停） */
    private _playerContacts: number = 0;
    private _playerNode: Node = null;

    get state(): WoodState { return this._state; }

    /** 所有漂浮木头的全局列表，工人砍树自动寻路用 */
    private static _all: FloatingWood[] = [];
    public static get all(): FloatingWood[] { return FloatingWood._all; }

    onLoad() {
        this._rb = this.getComponent(RigidBody);
        this._hp = this.hp;

        if (this._rb) {
            this._rb.useGravity = false;
            (this._rb as any).mass = 999;
            this._rb.linearDamping = 0;
            this._rb.angularDamping = 1000;
        }

        const collider = this.getComponent(Collider);
        if (collider) {
            collider.on('onCollisionEnter', this._onCollisionEnter, this);
            collider.on('onCollisionExit', this._onCollisionExit, this);
        }
        FloatingWood._all.push(this);
    }

    onDestroy() {
        const i = FloatingWood._all.indexOf(this);
        if (i >= 0) FloatingWood._all.splice(i, 1);
    }

    setState(s: WoodState) {
        this._state = s;
    }

    /**
     * 砍一刀
     * @returns true = 木头被砍倒
     */
    chop(damage: number = 1): boolean {
        if (this._state !== WoodState.CHOPPABLE) return false;
        this._hp -= damage;
        return this._hp <= 0;
    }

    update(dt: number) {
        // 漂出边界直接销毁
        if (this.node.worldPosition.x > this.despawnX) {
            this.node.destroy();
            return;
        }

        if (!this._rb) return;
        if (this._state === WoodState.DROPPED) return;

        // 撞到静态碰撞体 → 停住不动
        if (this._blockCount > 0) {
            this._rb.setLinearVelocity(Vec3.ZERO);
            return;
        }

        // 正面顶着玩家 → 停住；侧面接触 → 继续漂
        if (this._playerNode && this._playerNode.isValid && this._isPlayerInFront()) {
            this._rb.setLinearVelocity(Vec3.ZERO);
            return;
        }

        // FLOATING 和 CHOPPABLE 都保持漂动（砍的时候也在动）
        const v = this.flowDirection.clone();
        if (v.length() > 0.001) v.normalize();
        v.multiplyScalar(this.floatSpeed);
        this._rb.setLinearVelocity(v);
    }

    /** 玩家是否挡在木头前进方向的正前方（约 30° 扇形内） */
    private _isPlayerInFront(): boolean {
        const toPlayer = this._playerNode.worldPosition.clone().subtract(this.node.worldPosition);
        toPlayer.y = 0;
        if (toPlayer.length() < 0.001) return false;
        toPlayer.normalize();

        const flow = this.flowDirection.clone();
        flow.y = 0;
        if (flow.length() < 0.001) return false;
        flow.normalize();

        return Vec3.dot(toPlayer, flow) > 0.87;
    }

    private _onCollisionEnter(event: ICollisionEvent) {
        if (this._isDynamic(event)) {
            this._playerContacts++;
            this._playerNode = event.otherCollider.node;
            return;
        }
        this._blockCount++;
    }

    private _onCollisionExit(event: ICollisionEvent) {
        if (this._isDynamic(event)) {
            this._playerContacts = Math.max(0, this._playerContacts - 1);
            if (this._playerContacts === 0) this._playerNode = null;
            return;
        }
        this._blockCount = Math.max(0, this._blockCount - 1);
    }

    /** 对方是不是动态刚体（玩家） */
    private _isDynamic(event: ICollisionEvent): boolean {
        const rb = event.otherCollider.attachedRigidBody;
        return !!rb && rb.type === RigidBody.Type.DYNAMIC;
    }
}
