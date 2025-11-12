

export default class Time {
    private static _delta_time: number = 0;
    private static _last_frame: number = Date.now();

    public static updateDeltaTime(){
        const now = Date.now();
        this._delta_time = (now - this._last_frame) / 1000; // in seconds
        this._last_frame = now;
    }

    public static get delta_time(){
        return this._delta_time;
    }

    public static get time(){
        return this._last_frame / 1000; // in seconds
    }

}