import { _decorator, Component, Node, Vec3, CCFloat } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 相机跟随：保持固定俯仰角，用 Lerp 平滑跟随目标。
 * 挂在相机（或其挂载节点）上。
 */
@ccclass('CameraFollow')
export class CameraFollow extends Component {

    @property({ type: Node, tooltip: '跟随目标（玩家）' })
    target: Node = null;

    @property({ tooltip: '相对目标的偏移（高度 + 斜后方）' })
    offset: Vec3 = new Vec3();

    @property({ type: CCFloat, tooltip: '跟随速度（越小滞后感越强）' })
    followSpeed: number = 3;

    start() {
        if (!this.target) return;
        this.node.setPosition(this.target.position.clone().add(this.offset));
        this.node.setRotationFromEuler(-55, 45, 0);   // 固定视角，不在 update 里改
    }

    update(dt: number) {
        if (!this.target) return;

        const targetPos = this.target.position.clone().add(this.offset);
        const newPos = new Vec3();
        Vec3.lerp(newPos, this.node.position, targetPos, this.followSpeed * dt);
        this.node.setPosition(newPos);
    }
}
