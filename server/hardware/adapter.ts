/** Hardware implementations run outside request handlers so a blocked driver cannot freeze HTTP distribution. */
export interface HardwareAdapter { readonly kind:string; discover():Promise<HardwareDevice[]>; distribute(deviceId:string,payload:Record<string,string>):Promise<void> }
export interface HardwareDevice { id:string; name:string; connected:boolean; metadata?:Record<string,string> }
