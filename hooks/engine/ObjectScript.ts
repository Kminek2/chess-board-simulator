import GameObj from "./GameObj"

export default abstract class ObjectScript{
    private _game_obj: GameObj | null = null;

    constructor(game_obj: GameObj){
        this._game_obj = game_obj;
        game_obj.addScript(this);
        this.init();
    }

    public init(): void {};
    public earlyUpdate(): void {};
    public update(): void {};
    public lateUpdate(): void {};
}