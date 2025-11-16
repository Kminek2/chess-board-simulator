export default abstract class SceneClass {
  public abstract render(): SceneClass;
  public abstract scene(): React.JSX.Element;
}
