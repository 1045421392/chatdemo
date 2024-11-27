<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick, watch, computed } from 'vue';
import { CMDContent, Channel, ChannelInfo, ChannelTypePerson, ChannelTypeGroup, ConnectStatus, ConnectStatusListener, Conversation, ConversationAction, Message, WKSDK } from 'wukongimjssdk';
import { ConversationWrap } from './ConversationWrap';
import APIClient, { CMDType } from '../../services/APIClient';
import { getServerConfig } from '../../config'
import { Buffer } from 'buffer';
import { AtMessageContent } from '../../types/AtMessageContent'

const conversationWraps = ref<ConversationWrap[]>() // 本地最近会话列表

const selectedChannel = ref<Channel>() // 选中的频道

const props = defineProps<{
    onSelectChannel: (channel: Channel, title: string) => void,
    userName: string,
    isCollapse?: boolean,
    selectedChannel?: Channel
}>()

//const userName = defineProps<{ userName: string }>()

// 添加存储客服信息的响应式变量
const kefuNames = ref<{ [key: string]: string }>({})
const kefuAvatars = ref<{ [key: string]: string }>({})




// 添加存储用户名称的响应式变量
const userDisplayName = ref('')

// 添加头像的响应式引用
const userAvatar = ref('')

// 添加用户信息接口定义
interface UserInfo {
    name: string;
    account: string;
    avatar?: string;
}

// 添加存储群聊信息的响应式变量
const groupNames = ref<{ [key: string]: string }>({})

// 添加用户信息缓存管理
const userInfoCache = {
    cache: new Map<string, { data: UserInfo, timestamp: number }>(),
    pendingRequests: new Map<string, Promise<UserInfo | null>>(),
    batchQueue: new Set<string>(),
    batchTimeout: null as number | null,

    EXPIRE_TIME: 5 * 60 * 1000,

    getCached(uid: string): UserInfo | null {
        const cached = this.cache.get(uid);
        if (cached && Date.now() - cached.timestamp < this.EXPIRE_TIME) {
            return cached.data;
        }
        return null;
    },

    addToBatch(uid: string): Promise<UserInfo | null> {
        this.batchQueue.add(uid);

        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }

        this.batchTimeout = setTimeout(() => {
            this.executeBatch();
        }, 50);

        return new Promise((resolve) => {
            const pending = this.pendingRequests.get(uid);
            if (pending) {
                return pending.then(resolve);
            }
            const promise = new Promise<UserInfo | null>((res) => resolve(null));
            this.pendingRequests.set(uid, promise);
            return promise;
        });
    },

    addBatchNoWait(uids: string[]) {
        uids.forEach(uid => this.batchQueue.add(uid));

        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }

        this.batchTimeout = setTimeout(() => {
            this.executeBatch();
        }, 50);
    },

    async executeBatch() {
        if (this.batchQueue.size === 0) return;

        const accounts = Array.from(this.batchQueue);
        this.batchQueue.clear();

        const uncachedAccounts = accounts.filter(account => !this.getCached(account));
        if (uncachedAccounts.length === 0) return;
        console.log("uncachedAccounts", uncachedAccounts)
        try {
            const response = await fetch(`${getServerConfig().HOST}/site/imapi?s=/kefu/get`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    accounts: uncachedAccounts
                })
            });

            const result = await response.json();
            if (result.success && result.data) {
                Object.entries(result.data).forEach(([uid, data]) => {
                    const userInfo = data as UserInfo;
                    this.cache.set(uid, {
                        data: userInfo,
                        timestamp: Date.now()
                    });
                    kefuNames.value[uid] = userInfo.name;
                    kefuAvatars.value[uid] = userInfo.avatar ?? '';

                    // 如果是当前用户,更新头像和名称
                    if (uid === props.userName) {
                        userDisplayName.value = userInfo.name;
                        userAvatar.value = userInfo.avatar ?? '';
                    }

                    const pending = this.pendingRequests.get(uid);
                    if (pending) {
                        this.pendingRequests.delete(uid);
                    }
                });
            }
        } catch (error) {
            console.error('批量获取用户信息失败:', error);
        }
    }
};

// 添加群聊信息缓存管理
const groupInfoCache = {
    cache: new Map<string, { name: string, timestamp: number }>(),

    async fetchGroupNames(groupIds: string[]) {
        try {
            const response = await fetch(`${getServerConfig().HOST}/site/imapi?s=/kefu/setting`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    code: groupIds
                })
            });
            const result = await response.json();
            if (result.success && result.data) {
                result.data.forEach((group: any) => {
                    groupNames.value[group.code] = group.group;
                    this.cache.set(group.code, {
                        name: group.name,
                        timestamp: Date.now()
                    });
                });
            }
        } catch (error) {
            console.error('获取群组名称失败:', error);
        }
    }
};

// 添加获取头像的计算属性
const getAvatar = (uid: string) => {
    return kefuAvatars.value[uid];
}

// 在 script setup 顶部添加这些必要的响应式变量声明
const messages = ref<Message[]>([]) // 添加消息列表的响应式引用
const uid = ref<string>('') // 添加用户ID的响应式引用

// 添加一个标记来记录是否已经同步过
const hasSynced = ref(false)

// 添加新的类型定义
interface AtStatus {
    hasAt: boolean;
    messageIds: string[];
}

// 修改状态存储的类型
const atMessageStatus = ref<{ [key: string]: AtStatus }>({})

// 修改连接状态监听器中的相关代码
const connectStatusListener = async (status: ConnectStatus) => {
    console.log("!!!!!!同步最近会话列表", status)
    if (status === ConnectStatus.Connected && !hasSynced.value) {
        // 设置同步标记
        hasSynced.value = true

        const remoteConversations = await WKSDK.shared().conversationManager.sync()
        console.log("remoteConversations", remoteConversations)
        if (remoteConversations && remoteConversations.length > 0) {
            const filteredConversations = remoteConversations.filter(conv =>
                conv.channel.channelType === ChannelTypePerson ||
                conv.channel.channelType === ChannelTypeGroup
            );

            // 分别收集用户ID和群组ID
            const userIds = new Set<string>();
            const groupIds = new Set<string>();

            filteredConversations.forEach(conv => {
                if (conv.channel.channelType === ChannelTypePerson) {
                    userIds.add(conv.channel.channelID);
                } else if (conv.channel.channelType === ChannelTypeGroup) {
                    groupIds.add(conv.channel.channelID);
                }
            });

            // 分别获取用户信息和群组信息
            console.log("groupIds", groupIds)
            if (userIds.size > 0) {
                userInfoCache.addBatchNoWait(Array.from(userIds));
            }
            if (groupIds.size > 0) {
                groupInfoCache.fetchGroupNames(Array.from(groupIds));
            }

            conversationWraps.value = sortConversations(
                filteredConversations.map(
                    conversation => new ConversationWrap(conversation)
                )
            )

        }
        // 等待连接完全立后再创建会话
        await new Promise(resolve => setTimeout(resolve, 500));
        let role = localStorage.getItem('role')
        console.log("role", role)
        if (role === '0') {
            // 获取当前登录用户的uid
            uid.value = WKSDK.shared().config.uid || ""

            // 创建机器人会
            let robot = localStorage.getItem('robot') || ''
            let item_robot = new Channel(robot, ChannelTypePerson)
            await APIClient.shared.joinChannel(robot, ChannelTypePerson, uid.value)
            let conversation_robot = WKSDK.shared().conversationManager.findConversation(item_robot)
            if (!conversation_robot) {
                conversation_robot = WKSDK.shared().conversationManager.createEmptyConversation(item_robot)
            }
            console.log("conversation_robot", conversation_robot)
            // 检查最后一条消息的时间
            const shouldSendWelcome = () => {
                if (!conversation_robot || !conversation_robot.lastMessage) return true;

                // 检查最后一条消息是否是欢迎语
                try {
                    const lastContent = conversation_robot.lastMessage.content;
                    // 检查 contentObj 属性
                    if (lastContent && 'contentObj' in lastContent) {
                        const contentObj = (lastContent as any).contentObj;
                        // 检查是否是欢迎语消息
                        if (contentObj &&
                            contentObj.welcome_sent === true &&
                            contentObj.type === 1) {
                            return false;
                        }
                    }
                } catch (error) {
                    console.error('解析最后一条消息失败:', error);
                }

                // 检查时间间隔
                const lastMessageTime = conversation_robot.lastMessage.timestamp;
                const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (5 * 60);
                return lastMessageTime < fiveMinutesAgo;
            }

            if (robot && shouldSendWelcome()) {
                const welcomeMsg = {
                    content: "您好！我是您的智能客服助手，请问有什么可以帮助您",
                    type: 1,
                    welcome_sent: true
                };

                const payload = Buffer.from(JSON.stringify(welcomeMsg)).toString('base64');

                await fetch(`${getServerConfig().HOST}/site/imapi?s=/message/send`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        header: {
                            no_persist: 0,
                            red_dot: 1,
                            sync_once: 0
                        },
                        from_uid: robot,
                        channel_id: uid.value,
                        channel_type: ChannelTypePerson,
                        payload: payload
                    })
                });
            }

            // 默认选中机器人会话
            onSelectChannelClick(item_robot)

            // 创建群聊会话
            let groupcode = localStorage.getItem('groupcode') || ''
            if (groupcode) {
                let item_groupcode = new Channel(groupcode, ChannelTypeGroup)
                // 先加入频道
                await APIClient.shared.joinChannel(
                    groupcode,
                    ChannelTypeGroup,
                    WKSDK.shared().config.uid || ""
                )
                let conversation_groupcode = WKSDK.shared().conversationManager.findConversation(item_groupcode)
                if (!conversation_groupcode) {
                    WKSDK.shared().conversationManager.createEmptyConversation(item_groupcode)
                }

            }
        } else if (role === '1' || role === '2') {
            if (role === '1' && localStorage.getItem('scope') == '') {
                alert('当前客服账号没有设置供应商，请联系管理员设置')
                return;
            }
            // 客服角色只加入群聊和监听
            try {
                const response = await fetch(`${getServerConfig().HOST}/site/imapi?s=/kefu/setting`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        code: '',
                        supcust_no: role === '1' ? localStorage.getItem('scope') : ''
                    })
                });

                const result = await response.json();
                console.log("result", result)
                if (result.success && result.data) {
                    // 加入群聊并创建空会话
                    for (const group of result.data) {
                        // 创建群聊频道
                        let groupChannel = new Channel(group.code, ChannelTypeGroup)
                        // 创建空会话
                        let conversation = WKSDK.shared().conversationManager.findConversation(groupChannel)
                        if (!conversation) {
                            console.log("创建空会话", group.code)
                            // 加入群聊
                            await APIClient.shared.joinChannel(
                                group.code,
                                ChannelTypeGroup,
                                WKSDK.shared().config.uid || ""
                            )
                            WKSDK.shared().conversationManager.createEmptyConversation(groupChannel)
                            
                            // 发送欢迎消息
                            const welcomeMsg = {
                                content: `大家好，我是${kefuNames.value[WKSDK.shared().config.uid || ""] || WKSDK.shared().config.uid}`,
                                type: 1
                            };

                            try {
                                const payload = Buffer.from(JSON.stringify(welcomeMsg)).toString('base64');
                                await fetch(`${getServerConfig().HOST}/site/imapi?s=/message/send`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        header: {
                                            no_persist: 0,
                                            red_dot: 1,
                                            sync_once: 0
                                        },
                                        from_uid: WKSDK.shared().config.uid,
                                        channel_id: group.code,
                                        channel_type: ChannelTypeGroup,
                                        payload: payload
                                    })
                                });
                            } catch (error) {
                                console.error('发送欢迎消息失败:', error);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('获取群组设置失败:', error)
            }
        }

    }
}

// 监听cmd消息  
const cmdListener = (msg: Message) => {
    // console.log("收到CMD：", msg)
    const cmdContent = msg.content as CMDContent
    if (cmdContent.cmd === CMDType.CMDTypeClearUnread) {
        const clearChannel = new Channel(cmdContent.param.channelID, cmdContent.param.channelType)
        clearConversationUnread(clearChannel)
    }
}

// 修改会话监听器中的逻辑
const conversationListener = async (conversation: Conversation, action: ConversationAction) => {
    console.log("会话监听:", action, conversation)

    if (action === ConversationAction.add || action === ConversationAction.update) {
        const channel = conversation.channel;

        // 获取新会话的用户名或群名
        if (channel.channelType === ChannelTypePerson) {
            // 如果是个人会话且没有用户名，获取用户信息
            if (!kefuNames.value[channel.channelID]) {
                userInfoCache.addBatchNoWait([channel.channelID]);
            }
        } else if (channel.channelType === ChannelTypeGroup) {
            // 如果是群聊且没有群名，获取群信息
            if (!groupNames.value[channel.channelID]) {
                await groupInfoCache.fetchGroupNames([channel.channelID]);
            }
        }

        const conversationKey = `${channel.channelID}-${channel.channelType}`;

        // 如果是当前选中的会话，自动清除未读和@标记
        if (selectedChannel.value?.isEqual(conversation.channel)) {
            conversation.unread = 0;
            if (atMessageStatus.value[conversationKey]) {
                atMessageStatus.value[conversationKey] = {
                    hasAt: false,
                    messageIds: []
                };
                localStorage.setItem('atMessageStatus', JSON.stringify(atMessageStatus.value));
            }
        } else {
            // 如果不是当前会话，检查是否有@消息
            if (conversation.lastMessage?.content instanceof AtMessageContent) {
                const atContent = conversation.lastMessage.content as AtMessageContent;
                const isAtMe = atContent.atUsers.some(user => user.uid === props.userName);

                if (isAtMe) {
                    // 确保初始化正确的数据结构
                    if (!atMessageStatus.value[conversationKey] || typeof atMessageStatus.value[conversationKey] !== 'object') {
                        atMessageStatus.value[conversationKey] = {
                            hasAt: false,
                            messageIds: []
                        };
                    }

                    // 更新@状态
                    const currentStatus = atMessageStatus.value[conversationKey];
                    if (!currentStatus.messageIds.includes(conversation.lastMessage.messageID)) {
                        currentStatus.hasAt = true;
                        currentStatus.messageIds.push(conversation.lastMessage.messageID);
                        localStorage.setItem('atMessageStatus', JSON.stringify(atMessageStatus.value));
                    }
                }
            }
        }

        // 更新会话列表
        if (action === ConversationAction.add) {
            conversationWraps.value = [
                new ConversationWrap(conversation),
                ...(conversationWraps.value?.filter(wrap =>
                    !wrap.channel.isEqual(conversation.channel)) || [])
            ];
        } else {
            const index = conversationWraps.value?.findIndex(wrap =>
                wrap.channel.isEqual(conversation.channel)
            );

            if (index !== undefined && index >= 0) {
                const updatedWraps = [...(conversationWraps.value || [])];
                updatedWraps[index] = new ConversationWrap(conversation);
                conversationWraps.value = sortConversations(updatedWraps);
            }
        }
    } else if (action === ConversationAction.remove) {
        // 删除会话
        conversationWraps.value = conversationWraps.value?.filter(wrap =>
            !wrap.channel.isEqual(conversation.channel)
        ) || [];
    }
}



const clearConversationUnread = (channel: Channel) => {
    const conversation = WKSDK.shared().conversationManager.findConversation(channel)
    if (conversation) {
        conversation.unread = 0
        WKSDK.shared().conversationManager.notifyConversationListeners(conversation, ConversationAction.update)
    }
}

// 添加退出登录方法
const emit = defineEmits(['logout', 'update:isCollapse', 'editName'])

const handleLogout = () => {
    // 获取当前登录类型
    const loginType = localStorage.getItem('loginType') || 'a'

    // 清除登录信息
    localStorage.removeItem('username')
    localStorage.removeItem('password')
    localStorage.removeItem('robot')
    localStorage.removeItem('scope')
    localStorage.removeItem('groupcode')
    localStorage.removeItem('role')
    localStorage.removeItem('nickname')
    localStorage.removeItem('needUpdateName')

    // 触发退出事件,并传递登录类型
    emit('logout', loginType)
}

onMounted(async () => {
    console.log('!!!!list:monted')
    // 先添加所有监器
    WKSDK.shared().connectManager.addConnectStatusListener(connectStatusListener)
    WKSDK.shared().conversationManager.addConversationListener(conversationListener)
    WKSDK.shared().chatManager.addCMDListener(cmdListener)

    // 立即获取当前用户信息
    if (props.userName) {
        const userInfo = await userInfoCache.addToBatch(props.userName);
        if (userInfo) {
            userDisplayName.value = userInfo.name;
        }
    }

    if (props.selectedChannel?.channelID) {
        userInfoCache.addBatchNoWait([props.selectedChannel.channelID]);
    }

    // 添用户名称更新事件监听
    const handleUserNameUpdate = (event: CustomEvent) => {
        userDisplayName.value = event.detail.name;
        if (event.detail.avatar) {
            userAvatar.value = event.detail.avatar;
        }
    };

    document.addEventListener('userNameUpdated', handleUserNameUpdate as EventListener);

    // 修改用户名更新事件监听器
    document.addEventListener('userNameUpdated', ((e: CustomEvent) => {
        const currentUid = localStorage.getItem('username')
        if (currentUid && kefuNames.value) {  // 使用 .value 访问 ref 的值
            kefuNames.value[currentUid] = e.detail.name
        }
    }) as EventListener)

    // 从 localStorage 加载@消息状态
    const savedAtStatus = localStorage.getItem('atMessageStatus')
    if (savedAtStatus) {
        atMessageStatus.value = JSON.parse(savedAtStatus)
    }
})

onUnmounted(() => {
    hasSynced.value = false
    conversationWraps.value = []
    console.log('!!!!list:unmonted')
    WKSDK.shared().connectManager.removeConnectStatusListener(connectStatusListener)
    WKSDK.shared().conversationManager.removeConversationListener(conversationListener)
    WKSDK.shared().chatManager.removeCMDListener(cmdListener)
    // document.removeEventListener('userNameUpdated', handleUserNameUpdate as EventListener);

    // 修改用户名更新事监听器的移除
    document.removeEventListener('userNameUpdated', ((e: CustomEvent) => {
        const currentUid = localStorage.getItem('username')
        if (currentUid && kefuNames.value) {  // 使用 .value 访问 ref 的值
            kefuNames.value[currentUid] = e.detail.name
        }
    }) as EventListener)
})

// 序最近会话列表
const sortConversations = (conversations?: Array<ConversationWrap>) => {
    let newConversations = conversations;
    if (!newConversations) {
        newConversations = conversationWraps.value
    }
    if (!newConversations || newConversations.length <= 0) {
        return [];
    }
    let sortAfter = newConversations.sort((a, b) => {
        let aScore = a.timestamp;
        let bScore = b.timestamp;
        if (a.extra?.top === 1) {
            aScore += 1000000000000;
        }
        if (b.extra?.top === 1) {
            bScore += 1000000000000;
        }
        return bScore - aScore;
    });
    return sortAfter
}

// 修改选择会话的方法
const onSelectChannelClick = async (channel: Channel) => {
    let title = '';
    if (channel.channelType === ChannelTypeGroup) {
        title = (groupNames.value[channel.channelID] || channel.channelID) + '(群)';
    } else {
        title = kefuNames.value[channel.channelID] || channel.channelID;
    }

    selectedChannel.value = channel

    const conversation = WKSDK.shared().conversationManager.findConversation(channel)
    if (conversation) {
        const conversationKey = `${channel.channelID}-${channel.channelType}`;
        conversation.unread = 0;

        if (atMessageStatus.value[conversationKey]) {
            atMessageStatus.value[conversationKey] = {
                hasAt: false,
                messageIds: []
            };
            localStorage.setItem('atMessageStatus', JSON.stringify(atMessageStatus.value));
        }
    }

    const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel)
    if (!channelInfo) {
        await WKSDK.shared().channelManager.fetchChannelInfo(channel)
    }

    props.onSelectChannel(channel, title)
    await APIClient.shared.clearUnread(channel)
}



const fetchChannelInfoIfNeed = (channel: Channel) => {

    const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel)

    if (!channelInfo) {
        WKSDK.shared().channelManager.fetchChannelInfo(channel)
    }

}



// 修改 watch 来监听 props.selectedChannel 的变化
watch(() => props.selectedChannel, (newChannel) => {
    if (newChannel) {
        selectedChannel.value = newChannel
        const conversation = WKSDK.shared().conversationManager.findConversation(newChannel)
        if (conversation) {
            conversation.unread = 0
        }
    }
}, { immediate: true })

// 添加点击处理方法
const handleUserCardClick = () => {
    if (!props.isCollapse) {
        emit('editName')
    }
}

// 添加默认头像数组
const defaultAvatars = ref([
    'http://kefu.coolsaas.com.cn:8093/static/img/avatar/99.png',
    // ... 其他默认头像
])

// 修改获取群成员头像的方法
const getGroupMemberAvatars = (groupId: string) => {
    // 如果缓存中已有该群的头像，直接返回
    if (groupAvatarsCache.value[groupId]) {
        return groupAvatarsCache.value[groupId];
    }

    // 使用群ID生成固定的随机数
    const generateFixedRandom = (seed: string, max: number) => {
        // 将群ID转换为数字（单的hash）
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash = hash & hash;
        }
        // 确保是正数
        hash = Math.abs(hash);
        // 返回1-max之间的数字
        return (hash % max) + 1;
    }

    // 生成4个不同的随机数（1-20）
    const usedNumbers = new Set<number>();
    const baseNumber = generateFixedRandom(groupId, 20);

    while (usedNumbers.size < 4) {
        const num = ((baseNumber + usedNumbers.size) % 20) + 1;
        usedNumbers.add(num);
    }

    // 生成头像数组
    const avatars = Array.from(usedNumbers).map(num =>
        `http://kefu.coolsaas.com.cn:8093/static/img/avatar/${num}.png`
    );

    // 保存到缓存
    groupAvatarsCache.value[groupId] = avatars;

    return avatars;
}

// 添加缓存机制，避免每次渲染都重新随机
const groupAvatarsCache = ref<{ [key: string]: string[] }>({})

// 在 script setup 中添加搜索相关的响应式变量
const searchQuery = ref('')
const filteredConversations = computed(() => {
    if (!searchQuery.value || !conversationWraps.value) {
        return conversationWraps.value
    }

    return conversationWraps.value.filter(wrap => {
        const channelID = wrap.channel.channelID
        const query = searchQuery.value.toLowerCase()

        // 搜索群组名称
        if (wrap.channel.channelType === ChannelTypeGroup) {
            const groupName = groupNames.value[channelID] || channelID
            return groupName.toLowerCase().includes(query)
        }

        // 搜索用户名称
        const userName = kefuNames.value[channelID] || channelID
        return userName.toLowerCase().includes(query)
    })
})

// 添加一个计算属性来控制是否显示搜索框
const showSearch = computed(() => {
    return conversationWraps.value && conversationWraps.value.length > 10
})

// 修改 isAtMessage 函数
const isAtMessage = (conversation: ConversationWrap): boolean => {
    if (!conversation) return false;

    const conversationKey = `${conversation.channel.channelID}-${conversation.channel.channelType}`;
    const status = atMessageStatus.value[conversationKey];

    // 确保status存在且具有正确的数据结构
    if (status && typeof status === 'object' && 'hasAt' in status) {
        return status.hasAt && conversation.unread > 0;
    }
    return false;
}

</script>


<template>

    <div class="conversations" :class="{ 'show': !props.isCollapse }">
        <!-- 用户信息卡片 -->
        <div class="user-card" :class="{ 'collapsed': props.isCollapse }" @click="handleUserCardClick">
            <div class="avatar">
                <img :src="userAvatar || defaultAvatars[0]" />
            </div>
            <div class="user-info" v-if="!props.isCollapse">
                <div class="username">{{ userDisplayName || props.userName }}</div>
                <div class="status"></div>
            </div>
            <!-- 添加收起图标 -->
            <div class="collapse-icon" @click.stop="$emit('update:isCollapse', true)">
                <i class="fas fa-chevron-left"></i>
            </div>
        </div>

        <!-- 修改搜索框的显示条件 -->
        <div class="lsearch-box" v-if="!props.isCollapse && showSearch">
            <input type="text" v-model="searchQuery" placeholder="搜索" class="lsearch-input" />
        </div>

        <!-- 会话列表 -->
        <div class="conversation-list">
            <div :class="[
                'conversation-item',
                {
                    'selected': selectedChannel?.isEqual(conversationWrap.channel),
                    'at-message': isAtMessage(conversationWrap)
                }]" v-for="conversationWrap in filteredConversations"
                @click="onSelectChannelClick(conversationWrap.channel)">

                {{ fetchChannelInfoIfNeed(conversationWrap.channel) }}

                <div class="item-content">
                    <div class="avatar">
                        <template v-if="conversationWrap.channel.channelType === ChannelTypeGroup">
                            <div class="group-avatar">
                                <template
                                    v-for="(avatar, index) in getGroupMemberAvatars(conversationWrap.channel.channelID)"
                                    :key="index">
                                    <img :src="avatar" v-if="index < 4" />
                                </template>
                            </div>
                        </template>
                        <template v-else>
                            <img :src="getAvatar(conversationWrap.channel.channelID) || defaultAvatars[0]" />
                        </template>
                    </div>

                    <template v-if="!props.isCollapse">
                        <div class="info">
                            <div class="title-row">
                                <span class="title">
                                    {{
                                        conversationWrap.channel.channelType === ChannelTypeGroup
                                            ? (groupNames[conversationWrap.channel.channelID] ||
                                                conversationWrap.channel.channelID) + '(群)'
                                            : (kefuNames[conversationWrap.channel.channelID] ||
                                                conversationWrap.channel.channelID)
                                    }}
                                </span>
                                <span class="time">{{ conversationWrap.timestampString }}</span>
                            </div>
                            <div class="message-row">
                                <span class="last-message">
                                    <span class="at-badge" v-if="isAtMessage(conversationWrap)">有人@我</span>

                                    {{ conversationWrap.lastMessage?.content.conversationDigest }}
                                </span>
                                <span class="unread-badge"
                                    v-if="conversationWrap.unread > 0 && !selectedChannel?.isEqual(conversationWrap.channel)">
                                    {{ conversationWrap.unread }}
                                </span>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>

<style>
@import '../../styles/conversation.css';
</style>