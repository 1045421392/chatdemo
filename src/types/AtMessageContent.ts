import { MessageContent } from "wukongimjssdk"

export class AtMessageContent extends MessageContent {
    text: string = ''
    atUsers: Array<{uid: string, name: string}> = []

    constructor(text: string = '', atUsers: Array<{uid: string, name: string}> = []) {
        super()
        this.text = text
        this.atUsers = atUsers
        this.contentType = 10
    }

    // 解码消息内容
    decodeJSON(content: any) {
        this.text = content["text"] || ""
        this.atUsers = content["at_users"] || []
    }

    // 编码消息内容
    encodeJSON() {
        return {
            "text": this.text,
            "at_users": this.atUsers
        }
    }

    // 在会话列表中显示的摘要
    get conversationDigest() {
        return this.text
    }
} 