export default abstract class ObjectScript{
    public abstract init(): void;
    public abstract earlyUpdate(): void;
    public abstract update(): void;
    public abstract lateUpdate(): void;
}