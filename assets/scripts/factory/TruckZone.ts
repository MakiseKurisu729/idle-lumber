import { _decorator, Component, Node, Vec3, Prefab, instantiate, tween, CCFloat } from 'cc';
import { CoinZone } from './CoinZone';
import { StackZone } from './StackZone';
import { NodePool } from '../core/NodePool';

const { ccclass, property } = _decorator;

/**
 * 木板区（装车区）：接收木板堆叠，队首卡车装满 planksPerTruck 块就开走，
 * 离开后由 CoinZone 吐出金币；车队自动排队补上。
 * 堆叠 / 飞入 / 出栈逻辑都在基类 StackZone，这里只写卡车调度。
 */
@ccclass('TruckZone')
export class TruckZone extends StackZone {

    @property({ type: CCFloat })
    dropRange: number = 2.5;

    @property({ type: CCFloat })
    dropInterval: number = 0.08;

    @property({ type: CCFloat, tooltip: '木板从放置区飞上卡车的间隔（秒）' })
    sendInterval: number = 0.15;

    @property({ type: Prefab, tooltip: '卡车预制体' })
    truckPrefab: Prefab = null;

    @property({ type: Node, tooltip: '新车出生点（场外）' })
    spawnPoint: Node = null;

    @property({ type: [Node], tooltip: '排队点，第 0 个是装货位，后面依次往后排' })
    waitPoints: Node[] = [];

    @property({ type: Node, tooltip: '车开走的终点（场外）' })
    exitPoint: Node = null;

    @property({ type: CCFloat, tooltip: '装满多少块木板开走' })
    planksPerTruck: number = 18;

    @property({ tooltip: '木板堆叠原点（相对卡车的局部坐标），用来对准车厢' })
    loadOffset: Vec3 = new Vec3(0, 0.77, -2.021);

    @property({ tooltip: '木板在车厢上的朝向（局部旋转）' })
    stackRotation: Vec3 = new Vec3(0, 0, 0);

    @property({ type: CCFloat, tooltip: '车开走后，等多少秒后面的车再跟上' })
    truckGapDelay: number = 1.5;

    @property({ type: CoinZone })
    coinZone: CoinZone = null;

    @property({ type: CCFloat, tooltip: '一辆车开走生成多少枚金币' })
    coinsPerTruck: number = 15;

    /** 木板落地朝向 +90，与车厢上的视觉一致（卡车自身旋转 90 度） */
    protected itemYawOffset = 90;

    private _dropTimer: number = 0;
    private _sendTimer: number = 0;

    private _trucks: Node[] = [];
    private _loaded: number = 0;
    private _leaving: boolean = false;

    start() {
        // 开局：装货位直接停一辆，其余排队点各生成一辆从场外开入
        for (let i = 0; i < this.waitPoints.length; i++) {
            const from = (i === 0) ? this.waitPoints[0] : this.spawnPoint;
            const truck = this._spawnTruck(from.worldPosition);
            this._trucks.push(truck);
            if (i > 0) this._driveTo(truck, this.waitPoints[i].worldPosition);
        }
    }

    update(dt: number) {
        this._syncRotationIfChanged();
        if (!this.player || !this.player.node || !this.player.node.isValid) return;

        const dist = Vec3.distance(this.player.node.worldPosition, this.node.worldPosition);
        if (dist <= this.dropRange && this.player.backpack.count > 0) {
            this._dropTimer += dt;
            if (this._dropTimer >= this.dropInterval) {
                this._dropTimer = 0;
                this._tryDropFromPlayer();
            }
        } else {
            this._dropTimer = 0;
        }

        this._sendTimer += dt;
        if (this._sendTimer >= this.sendInterval) {
            this._sendTimer = 0;
            this._trySendToTruck();
        }
    }

    private _tryDropFromPlayer() {
        const plank = this.player.backpack.takeWood(this.acceptPrefix);
        if (!plank) return;
        this._flyIn(plank, plank.worldPosition.clone());
    }

    private _trySendToTruck() {
        if (this._leaving) return;
        if (this._trucks.length === 0 || this._items.length === 0) return;
        if (this._loaded >= this.planksPerTruck) return;   // 已满，等车开走

        const plank = this._items.pop()!;                  // 出栈：最后堆的先上车

        const truck = this._trucks[0];
        const stackIndex = this._loaded;
        this._loaded++;

        const startWorldPos = plank.worldPosition.clone();
        plank.setParent(truck);
        plank.setWorldPosition(startWorldPos);
        plank.setRotationFromEuler(this.stackRotation.x, this.stackRotation.y, this.stackRotation.z);

        const localTarget = this._calcSlot(stackIndex);
        const targetWorldPos = new Vec3();
        Vec3.transformMat4(targetWorldPos, localTarget, truck.worldMatrix);

        const midPos = new Vec3(
            (startWorldPos.x + targetWorldPos.x) / 2,
            Math.max(startWorldPos.y, targetWorldPos.y) + 2.5,
            (startWorldPos.z + targetWorldPos.z) / 2
        );

        tween(plank)
            .to(0.2, { worldPosition: midPos }, { easing: 'quadOut' })
            .to(0.2, { worldPosition: targetWorldPos }, { easing: 'bounceOut' })
            .call(() => {
                plank.setPosition(localTarget);
                if (this._loaded >= this.planksPerTruck) {
                    this._sendTruckAway();
                }
            })
            .start();
    }

    private _sendTruckAway() {
        this._leaving = true;
        this._loaded = 0;

        const full = this._trucks.shift()!;
        const exitPos = this.exitPoint.worldPosition.clone();

        tween(full)
            .to(2.5, { worldPosition: exitPos }, { easing: 'quadIn' })
            .call(() => {
                // 先回收车厢里的木板，再销毁车（否则子节点会被连带销毁）
                for (let i = full.children.length - 1; i >= 0; i--) {
                    const child = full.children[i];
                    if (child.name.startsWith('Plank_')) {
                        NodePool.put(child);
                    }
                }
                full.destroy();
                if (this.coinZone) this.coinZone.spawnCoins(this.coinsPerTruck);
            })
            .start();

        // 等一小段时间，后面的车再跟上，队尾补一辆新车
        this.scheduleOnce(() => {
            if (this._trucks.length > 0) {
                for (let i = 0; i < this._trucks.length; i++) {
                    const cb = (i === 0) ? () => { this._leaving = false; } : undefined;
                    this._driveTo(this._trucks[i], this.waitPoints[i].worldPosition, cb);
                }
                const fresh = this._spawnTruck(this.spawnPoint.worldPosition);
                this._trucks.push(fresh);
                this._driveTo(fresh, this.waitPoints[this._trucks.length - 1].worldPosition);
            } else {
                const fresh = this._spawnTruck(this.spawnPoint.worldPosition);
                this._trucks.push(fresh);
                this._driveTo(fresh, this.waitPoints[0].worldPosition, () => { this._leaving = false; });
            }
        }, this.truckGapDelay);
    }

    private _spawnTruck(worldPos: Vec3): Node {
        const truck = instantiate(this.truckPrefab);
        truck.setParent(this.node.parent || this.node);
        truck.setWorldPosition(worldPos);
        return truck;
    }

    private _driveTo(truck: Node, worldPos: Vec3, onArrive?: () => void) {
        const dist = Vec3.distance(truck.worldPosition, worldPos);
        const duration = Math.max(dist / 8, 0.3);
        tween(truck)
            .to(duration, { worldPosition: worldPos.clone() }, { easing: 'quadOut' })
            .call(() => { if (onArrive) onArrive(); })
            .start();
    }

    /** 车厢内第 index 块：3 摞沿 X 排，每摞竖直叠 6 层 */
    private _calcSlot(index: number): Vec3 {
        const cols = 3;
        const spacingX = 0.553;
        const spacingY = 0.2;

        const col = index % cols;
        const layer = Math.floor(index / cols);

        return new Vec3(
            this.loadOffset.x + (1 - col) * spacingX,
            this.loadOffset.y + layer * spacingY,
            this.loadOffset.z
        );
    }

    /** 布局：沿 Z 排 4 个一层 */
    protected _layoutPos(index: number): Vec3 {
        const perLayer = 4;
        const cols = 4;
        const spacing = 0.35;
        const startZ = -((cols - 1) * spacing) / 2;

        const layer = Math.floor(index / perLayer);
        const col = (index % perLayer) % cols;

        return this._rotateY(0, layer * spacing, startZ + col * spacing);
    }
}
