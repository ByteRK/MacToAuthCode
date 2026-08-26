import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { AppConfig } from '../config.js'

export class AuthService {
  private readonly secret=randomBytes(32)
  constructor(private config: AppConfig) {}
  verifyCredentials(username:string,password:string) {
    return this.safeEqual(username,this.config.adminUser) && this.safeEqual(password,this.config.adminPassword)
  }
  issue() { const expires=Date.now()+8*60*60*1000; const nonce=randomBytes(12).toString('hex'); const payload=`${expires}.${nonce}`; return `${payload}.${this.sign(payload)}` }
  verify(token:string|undefined) {
    if(!token) return false; const parts=token.split('.'); if(parts.length!==3) return false
    const payload=`${parts[0]}.${parts[1]}`; return Number(parts[0])>Date.now() && this.safeEqual(parts[2],this.sign(payload))
  }
  private sign(value:string){return createHmac('sha256',this.secret).update(value).digest('hex')}
  private safeEqual(a:string,b:string){const left=Buffer.from(a);const right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right)}
}
