<script setup lang="ts">
// 导入必要的Vue组件和功能
import { nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import APIClient from '../services/APIClient'
import { useRouter } from "vue-router";
// 导入WuKongIM SDK相关组件
import { WKSDK, Message, StreamItem, MessageText, Channel, ChannelTypePerson, ChannelTypeGroup, MessageStatus, PullMode, MessageContent, MessageContentType, MessageImage } from "wukongimjssdk";
import { ConnectStatus, ConnectStatusListener } from 'wukongimjssdk';
import { SendackPacket, Setting } from 'wukongimjssdk';
import { Buffer } from 'buffer';
import { MessageListener, MessageStatusListener } from 'wukongimjssdk';
import Conversation from '../components/Conversation/index.vue'
import { Base64 } from 'js-base64';
import type { UploadProps, UploadUserFile } from 'element-plus'
import { SERVER_CONFIG, getServerConfig } from '../config'
import { ElMessage } from 'element-plus'
import { AtMessageContent } from '../types/AtMessageContent'

// 初始化路由
const router = useRouter();

// 聊天界面相关的响应式变量
const chatRef = ref<HTMLElement | null>(null) // 聊天窗口的DOM引用
const showSettingPanel = ref(false) // 控制设置面板的/隐藏
const title = ref("") // 聊天标题
const text = ref("") // 输入框的文本内容
let msgCount = 0 // 消息计数器

// 频道相关的响应式变量
const channelID = ref("") // 当前聊天的频道ID
const p2p = ref(true) // 是否是点对点聊天(true为单聊，false为群聊)
const robot = localStorage.getItem('robot') || '' // 从本地存储获取机器人ID
const to = ref(new Channel("", 1)) // 聊天对象的频道信息
const placeholder = ref("请输入对方登录名") // 输入框占位符文本

// 消息加载相关的响应式变量
const pulldowning = ref(false) // 是否正在下拉加载历史消息
const pulldownFinished = ref(false) // 是否已加载完所有历史消息

// 流式消息相关的响应式变量
const startStreamMessage = ref(false) // 是否开启流式消息
const msgInputPlaceholder = ref("请输入消息") // 消息输入框的占位符
const streamNo = ref<string>() // 流消息的序号

// 存储消息列表的响应式数组
const messages = ref<Message[]>(new Array<Message>())

// 用户认证相关信息
let uid_ = localStorage.getItem('username')
if (uid_ == undefined) uid_ = ''
if (uid_ == null) uid_ = ''
console.log('uid__________', uid_, localStorage.getItem('username'))
if (uid_ == '') router.push({ path: '/login' }) // 如果没有用户名，跳转到登录页
const uid = ref(uid_)
const token = localStorage.getItem('password')

// 设置初始标题
title.value = `${uid_ || ""}(离线)`

// 声明连接状态监听器和消息监听器
let connectStatusListener!: ConnectStatusListener
let messageListener!: MessageListener
let messageStatusListener!: MessageStatusListener

// 控制侧边栏的展开/收起
const isCollapse = ref(false)

// 添加获取客服信息的响应式变量和方法
const kefuName = ref('')

// 修改获取客服信息的方法
const kefuInfoCache = new Map<string, Promise<any>>();

const getKefuInfo = async (account: string) => {
	if (!account) return null;

	// 检查是否已经有这个账号的请求在进行中
	if (kefuInfoCache.has(account)) {
		return kefuInfoCache.get(account);
	}

	// 如果已经有缓存的用户信息，直接返回
	if (userNames.value[account]) {
		return {
			name: userNames.value[account],
			avatar: userAvatars.value[account],
			account: account
		};
	}

	// 创建新的请求
	const promise = (async () => {
		try {
			const response = await fetch(`${getServerConfig().HOST}/site/imapi?s=/kefu/get`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					accounts: [account]
				})
			});
			const result = await response.json();
			
			if (result.success && result.data && result.data[account]) {
				const userInfo = result.data[account];
				// 更新缓存
				userNames.value[account] = userInfo.name;
				userAvatars.value[account] = userInfo.avatar || getImg(account);
				return userInfo;
			}
		} catch (error) {
			console.error('获取客服信息失败:', error);
		} finally {
			// 请求完成后删除缓存的 promise
			kefuInfoCache.delete(account);
		}
		return null;
	})();

	// 缓存这个 promise
	kefuInfoCache.set(account, promise);
	return promise;
}


// 在 script setup 中声明一个处理函数
const handleCreateGroupChat = () => {
	createGroupChat();
};

// 在组件挂载时也取一次
onMounted(async () => {
	// 获取 URL 参数
	const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
	const urlUid = urlParams.get('uid');
	const urlToken = urlParams.get('token');
	const urlChannelID = urlParams.get('channelID');

	// 如果 URL 中有登录参数,进行自动登录
	if (urlUid && urlToken) {
		localStorage.setItem('username', urlUid);
		localStorage.setItem('password', urlToken);
		uid.value = urlUid;
	}

	const config = getServerConfig()
	APIClient.shared.config.apiURL = `${config.HOST}/site/imapi?s=/`
	let addr = `${config.WS_HOST}`
	connectIM(addr)
	console.log(to.value)
	addConv()

	// 如果有指定的 channelID,自动选择该会话
	if (urlChannelID) {
		// 等待连接完成后再选择会话
		await new Promise(resolve => {
			const checkConnection = () => {
				if (WKSDK.shared().connectManager.status === ConnectStatus.Connected) {
					resolve(true);
				} else {
					setTimeout(checkConnection, 100);
				}
			};
			checkConnection();
		});

		// 创建频道并选择
		const autoChannel = new Channel(urlChannelID, ChannelTypePerson);
		await APIClient.shared.joinChannel(urlChannelID, ChannelTypePerson, uid.value);

		// 获取频道名称
		const userInfo = await getKefuInfo(urlChannelID);
		const channelTitle = userInfo ? userInfo.name : urlChannelID;

		// 选择该频道
		onSelectChannel(autoChannel, channelTitle);
	}

	document.addEventListener('previewImage', ((e: CustomEvent) => {
		showPreview(e.detail)
	}) as EventListener)

	// 移除可能存在的旧监听器
	document.removeEventListener('createGroupChat', handleCreateGroupChat);
	// 添加新的���听器
	document.addEventListener('createGroupChat', handleCreateGroupChat);



	// 检查是否需要修改名称
	const needUpdateName = localStorage.getItem('needUpdateName')
	if (needUpdateName === 'true') {
		// 清除标记
		localStorage.removeItem('needUpdateName')
		// 打开修改名称对话框
		showEditName()
	}

	// 注册@消息类型
	const contentTypeAt = 10 // 自定义@消息类型
	WKSDK.shared().register(contentTypeAt, () => new AtMessageContent())

	// 获取客服列表
	await getKefuList()
})

// 添加会话的方法
const addConv = async () => {

}

// 连接IM服务器的方法
const connectIM = (addr: string) => {
	//WKSDK.shared().config.token = token
	WKSDK.shared().config.uid = uid.value;
	WKSDK.shared().config.addr = addr

	// 监听接状态
	connectStatusListener = (status) => {
		if (status == ConnectStatus.Connected) {
			title.value = WKSDK.shared().config.uid + `(在线)`
			channelID.value = to.value.channelID
		} else {
			title.value = WKSDK.shared().config.uid + `(离线)`
		}
	}
	WKSDK.shared().connectManager.addConnectStatusListener(connectStatusListener)

	// 修改消息监听器部分的代码
	messageListener = (msg) => {
		if (!to.value.isEqual(msg.channel)) {
			return
		}

		// 获��户信息的逻辑移到这里，使用 Promise 方式避免阻塞
		if (!userNames.value[msg.fromUID]) {
			getKefuInfo(msg.fromUID).then(userInfo => {
				if (userInfo) {
					userNames.value[msg.fromUID] = userInfo.name;
					// 同时缓存头像信息
					if (userInfo.avatar) {
						userAvatars.value[msg.fromUID] = userInfo.avatar;
					} else {
						// 定义头像，使用默认头像
						userAvatars.value[msg.fromUID] = getImg(msg.fromUID);
					}
				} else {
					userNames.value[msg.fromUID] = msg.fromUID;
					userAvatars.value[msg.fromUID] = getImg(msg.fromUID);
				}
			});
		}

		if (msg.streamOn) {
			let exist = false
			for (const message of messages.value) {
				if (message.streamNo === msg.streamNo) {
					let streams = message.streams;
					const newStream = new StreamItem()
					newStream.clientMsgNo = msg.clientMsgNo
					newStream.streamSeq = msg.streamSeq || 0
					newStream.content = msg.content
					if (streams && streams.length > 0) {
						streams.push(newStream)
					} else {
						streams = [newStream]
					}
					message.streams = streams
					exist = true
					break
				}
			}
			if (!exist) {
				messages.value.push(msg)
			}
		} else {
			messages.value.push(msg)
		}

		scrollBottom()
	}
	WKSDK.shared().chatManager.addMessageListener(messageListener)

	// 优化消息状态监听器
	messageStatusListener = (ack: SendackPacket) => {
		console.log('消息状态更新:', ack)
		const index = messages.value.findIndex(m => m.clientSeq === ack.clientSeq)
		if (index !== -1) {
			const message = messages.value[index]
			message.status = ack.reasonCode === 1 ? MessageStatus.Normal : MessageStatus.Fail
			// 强制更新数组以触发视图更新
			messages.value = [...messages.value]
		}
	}
	WKSDK.shared().chatManager.addMessageStatusListener(messageStatusListener)

	WKSDK.shared().connect()
}

// 组件卸载时的生命周期钩子
onUnmounted(() => {
	// 移除所有监听器并断开连接
	WKSDK.shared().connectManager.removeConnectStatusListener(connectStatusListener)
	WKSDK.shared().chatManager.removeMessageListener(messageListener)
	WKSDK.shared().chatManager.removeMessageStatusListener(messageStatusListener)
	WKSDK.shared().disconnect()

	// 移除图片预览事件监听器
	document.removeEventListener('previewImage', ((e: CustomEvent) => {
		showPreview(e.detail)
	}) as EventListener)

	// 移除群聊创建事件监听器
	document.removeEventListener('createGroupChat', handleCreateGroupChat);
})


// 滚动聊天窗口到底部
const scrollBottom = () => {
	nextTick(() => {
		const chat = chatRef.value;
		if (!chat) return;

		// 直接设 scrollTop，不使用平滑滚动
		chat.scrollTop = chat.scrollHeight;

		// 确保在图片加载后也能正确滚动
		requestAnimationFrame(() => {
			chat.scrollTop = chat.scrollHeight;
		});
	});
}

// 拉取当前会话最新消息
const pullLast = async () => {
	pulldowning.value = true;
	pulldownFinished.value = false;

	try {
		const msgs = await WKSDK.shared().chatManager.syncMessages(to.value, {
			limit: 15,
			startMessageSeq: 0,
			endMessageSeq: 0,
			pullMode: PullMode.Up
		});

		if (msgs && msgs.length > 0) {
			// 收集所有唯一的用户ID
			const uniqueUids = new Set<string>();
			msgs.forEach(msg => uniqueUids.add(msg.fromUID));

			// 过滤掉已经有缓存的用户ID
			const uidsToFetch = Array.from(uniqueUids).filter(uid => !userNames.value[uid]);

			// 只获取未缓存的用户信息
			if (uidsToFetch.length > 0) {
				try {
					const response = await fetch(`${getServerConfig().HOST}/site/imapi?s=/kefu/get`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							accounts: uidsToFetch
						})
					});

					const result = await response.json();
					if (result.success && result.data) {
						Object.entries(result.data).forEach(([uid, data]) => {
							const userInfo = data as UserInfo;
							userNames.value[uid] = userInfo.name;
							userAvatars.value[uid] = userInfo.avatar || getImg(uid);
						});
					}
				} catch (error) {
					console.error('获取用户信息失败:', error);
				}
			}

			messages.value.push(...msgs);
		}
	} catch (error) {
		console.error('加载消息失败:', error);
	} finally {
		pulldowning.value = false;
		scrollBottom();
	}
}

// 下拉加载历史消息
const pullDown = async () => {
	if (messages.value.length == 0) return;

	const firstMsg = messages.value[0];
	if (firstMsg.messageSeq == 1) {
		pulldownFinished.value = true;
		return;
	}

	try {
		const msgs = await WKSDK.shared().chatManager.syncMessages(to.value, {
			limit: 15,
			startMessageSeq: firstMsg.messageSeq - 1,
			endMessageSeq: 0,
			pullMode: PullMode.Down
		});

		if (msgs && msgs.length > 0) {
			// 批量获取所有消息发送者的名称
			const uniqueUids = new Set(msgs.map(msg => msg.fromUID));
			const promises = Array.from(uniqueUids).map(uid => userInfoCache.addToBatch(uid));
			await Promise.all(promises);

			messages.value.unshift(...msgs.reverse());
		}

		if (msgs.length < 15) {
			pulldownFinished.value = true;
		}
	} catch (error) {
		console.error('加载历史消息失败:', error);
	}

	// 保持滚动位置
	nextTick(() => {
		const chat = chatRef.value;
		const firstMsgEl = document.getElementById(firstMsg.clientMsgNo);
		if (chat && firstMsgEl) {
			chat.scrollTop = firstMsgEl.offsetTop;
		}
	});
}



// 处理选择聊天对象
const onSelectChannel = async (channel: Channel, title: string) => {
	to.value = channel
	channelID.value = channel.channelID
	p2p.value = channel.channelType == ChannelTypePerson
	showSettingPanel.value = false
	messages.value = []

	// 使用传递过来的标题
	kefuName.value = title

	// 在移动端时,选择聊天对象后自动收起列表
	if (window.innerWidth <= 640) {
		isCollapse.value = true
	}

	// 清空之前的客服列表
	kefuList.value = []
	showAtPanel.value = false

	// 如果是群聊,获取该群的客服列表
	if (channel.channelType === ChannelTypeGroup) {
		await getKefuList(channel.channelID)
	}

	pullLast() // 拉取最���消息
}

// 修改发送消息方法
const onSend = () => {
	if (to.value.channelID === "") {
		ElMessage.warning('请先选择会话对象')
		return;
	}
	if (!text.value || text.value.trim() === "") {
		ElMessage.warning('请输入信息内容')
		return;
	}

	const setting = Setting.fromUint8(0)
	if (to.value && to.value.channelID != "") {
		let content: MessageContent

		// 只在群聊中处理@消息
		if (to.value.channelType === ChannelTypeGroup) {
			const atMatches = text.value.match(/@(\S+?)\s/g)
			if (atMatches) {
				const atList = atMatches.map(at => {
					const name = at.slice(1).trim() // 移除@符号和空格
					// 先通过名称查找用户
					const user = kefuList.value.find(k => k.name === name)
					if (user) {
						return { uid: user.account, name: user.name }
					}
					// 如果找不到,尝试通过账号查找
					const userByAccount = kefuList.value.find(k => k.account === name)
					if (userByAccount) {
						return { uid: userByAccount.account, name: userByAccount.name || userByAccount.account }
					}
					return null
				}).filter((u): u is { uid: string, name: string } => u !== null)

				if (atList.length > 0) {
					// 使自���义的@消息��型
					content = new AtMessageContent(text.value, atList)
				} else {
					content = new MessageText(text.value)
				}
			} else {
				content = new MessageText(text.value)
			}
		} else {
			// 单聊直接使用普通文本消息
			content = new MessageText(text.value)
		}

		if (streamNo.value && streamNo.value !== '') {
			setting.streamNo = streamNo.value
		}

		WKSDK.shared().chatManager.send(content, to.value, setting)
		text.value = ""
		
		// 重置输入框高度
		const textarea = document.querySelector('.message-input') as HTMLTextAreaElement
		if (textarea) {
			textarea.style.height = '40px' // 重置为初始高度
		}
	} else {
		showSettingPanel.value = true
	}
	scrollBottom()
}

// 发送图片消息的方法
const onSendImg = (url: string) => {
	if (!text.value || text.value.trim() === "") {
		msgCount++
		text.value = `${msgCount}`
	}
	const setting = Setting.fromUint8(0)
	if (to.value && to.value.channelID != "") {
		if (streamNo.value && streamNo.value !== '') {
			setting.streamNo = streamNo.value
		}
		// 创建图片消息
		const msgContent = new MessageImage()
		if (url == '') {
			// 如果没有提供URL,使用默认图片
			const config = getServerConfig()
			msgContent.url = `${config.HOST}/qam/img/20240507/1715051818527950.jpg`
		} else {
			msgContent.url = url
		}
		// 设置图片宽度为窗口宽度的90%
		msgContent.width = window.innerWidth * 0.9

		// 发送图片息
		WKSDK.shared().chatManager.send(msgContent, to.value)
	} else {
		showSettingPanel.value = true
	}
	scrollBottom()
}



// 获取消息文本内容
const getMessageText = (m: any) => {
	if (m instanceof Message) {
		// 处理@消息类型
		if (m.content instanceof AtMessageContent) {
			const atContent = m.content as AtMessageContent;
			let text = atContent.text;

			// 替换@提及为高亮显示
			atContent.atUsers.forEach(user => {
				const regex = new RegExp(`@${user.name}\\s`, 'g');
				text = text.replace(regex, `<span class="at-mention">@${user.name}</span> `);
			});

			return text;
		}

		const streams = m.streams
		let text = ""

		if (m.content instanceof MessageText) {
			const messageText = m.content as MessageText
			text = messageText.text || ""

			// 添加人工客服消息的点击处理
			if (text === '没有关的答案？可点击我联系人工客服') {
				return `<div class="customer-service-msg" onclick="document.dispatchEvent(new CustomEvent('createGroupChat'))">没有相关的答案,可点击我提交您的问题,稍后客服回复您。</div>`
			}

			// 处其他消类型...
			if (m.content.contentObj != undefined) {
				if (m.content.contentObj.is_json == true) {
					try {
						return JSON.parse(text)
					} catch (e) {
						return text
					}
				}
			}
		}
		// 处理流消息
		if (streams && streams.length > 0) {
			for (const stream of streams) {
				if (stream.content instanceof MessageText) {
					const messageText = stream.content as MessageText
					text = text + (messageText.text || "")
				}
			}
		}
		// 处理图片消息
		if (m.contentType == 2) {
			text = `<img style='cursor: pointer;' src='${m.content.url}' onclick="document.dispatchEvent(new CustomEvent('previewImage', {detail: '${m.content.url}'}))">`
		}

		return text
	}

	return "未知消息"
}

// 获取消息类型
const getMessageType = (m: any) => {
	// 1:普通消息 2:答案列表 3:转发提问 4.转人工
	if (m.content instanceof AtMessageContent) {
		return 1; // 将@消息作为普通文本消息处理
	}
	if (m.content instanceof MessageText) {
		const messageText = m.content as MessageText
		if (m.content.contentObj != undefined) {
			if (m.content.contentObj.qa != undefined) {
				return 3
			}
			if (m.content.contentObj.is_json == true) {
				try {
					let text = messageText.text || ""
					JSON.parse(text)
					return 2
				} catch (e) {
					return 1
				}
			}
		}
		return 1
	}
	return 1
}


const handleScroll = (e: any) => {
	const targetScrollTop = e.target.scrollTop;
	//const scrollOffsetTop = e.target.scrollHeight - (targetScrollTop + e.target.clientHeight);
	if (targetScrollTop <= 250) { // 下
		if (pulldowning.value || pulldownFinished.value) {
			console.log("不允许下拉", "pulldowning", pulldowning.value, "pulldownFinished", pulldownFinished.value)
			return
		}
		console.log("下拉")
		pulldowning.value = true
		pullDown().then(() => {
			pulldowning.value = false
		}).catch(() => {
			pulldowning.value = false
		})
	}
}

const onEnter = () => {
	onSend()
}


const show = ref(false)
const richContent = ref('')
const showAnswer = (content: any, keyword: any) => {
	show.value = true;
	richContent.value = content
}
const sendData = ref({ 'q': '', 'from_uid': '', 'clientMsgNo': '', 'reply': "", 'fromUID': '' })
const showSendBox = ref(false)
const sendAnswerBox = (m: any) => {
	showSendBox.value = !showSendBox.value
	sendData.value.clientMsgNo = m.clientMsgNo
	sendData.value.from_uid = getMessageText(m).from_uid//提问客户id
	sendData.value.q = getMessageText(m).q
	sendData.value.reply = sendData.value.q
	sendData.value.fromUID = m.fromUID//器人id
	console.log(sendData.value)
}
const sendOKClick = (type: number) => {
	if (type == 0) {
		close()
		return;
	}

	var myHeaders = new Headers();
	let payload = JSON.stringify({ "content": sendData.value.q, "type": 1 })
	var raw = JSON.stringify({
		"reply": sendData.value.reply,
		'content': sendData.value.q,
		"payload": Base64.encode(payload),
		"from_uid": sendData.value.fromUID,//机器人
		'kf': uid.value,//人工客
		"channel_id": sendData.value.from_uid,
		'clientMsgNo': sendData.value.clientMsgNo,
		"channel_type": 1
	});

	var requestOptions: RequestInit = {
		method: 'POST',
		headers: myHeaders,
		body: raw,
		redirect: 'follow'
	};
	const config = getServerConfig()
	fetch(`${config.HOST}/site/imapi?s=/message/send`, requestOptions)
		.then(response => response.text())
		.then(result => console.log(result))
		.catch(error => console.log('error', error));
	console.log(sendData.value.q, sendData.value.from_uid)
	showSendBox.value = !showSendBox.value
}
function close() {
	show.value = false;
	showSendBox.value = false;
}
let comKey = 1;
const uecfg = {
	//是否开启字数统计
	wordCount: true,
	//许输入的最大字符数
	maximumWords: 9999,
	// 编辑器不自动被内容撑高
	autoHeightEnabled: false,
	// 初始容高度
	initialFrameHeight: 440,
	// 初始容器宽度
	initialFrameWidth: '100%',
	// 上文件接
	serverUrl: `${getServerConfig().UPLOAD_SERVER}/controller.php`,
	// UEditor 资源文件的存放路径，通常Nuxt项目设/UEditor/即可
	// UEDITOR_HOME_URL: `/UEditor/`,
	UEDITOR_HOME_URL: `UEditor/`,
	// 合最新编译的资源文，你可以实现加自定义Request Headers,详情https://github.com/HaoChuan9421/ueditor/commits/dev-1.4.3.3
	/* headers: {
	   Authorization: `Bearer ${cookie.get('token')}`,
	   tenantId: cookie.get('tenantId')
	 }, */
	readonly: false,
	focus: true
}
const showConver = ref(true)
if (document.body.clientWidth <= 640) {
	showConver.value = false;
}
const showConverClick = () => {
	isCollapse.value = !isCollapse.value;
}

const getImg = (name: string) => {
	const config = getServerConfig()
	return `${config.HOST}/site/get-img?name=${name}`
}
const fileList = ref<UploadUserFile[]>([])

const handleChange: UploadProps['onChange'] = (uploadFile, uploadFiles) => {
	if (uploadFile.response != undefined) {
		let res = JSON.parse(JSON.stringify(uploadFile.response))
		const config = getServerConfig()
		onSendImg(`${config.UPLOAD_SERVER}${res.url}`)
	}
	//fileList.value = []
}

// 加图片预览相关的应式变量
const previewImage = ref('')

// 添加图片预览相关的法
const showPreview = (url: string) => {
	previewImage.value = url
	document.body.style.overflow = 'hidden' // 防止滚动
}

const closePreview = () => {
	previewImage.value = ''
	document.body.style.overflow = '' // 恢复背景滚动
}

const showLogoutConfirm = ref(false)

const showLogoutDialog = () => {
	showLogoutConfirm.value = true
}

const confirmLogout = () => {
	localStorage.setItem('username', '')
	WKSDK.shared().connectManager.disconnect()
	router.push({ path: '/login' })
	showLogoutConfirm.value = false
}

const cancelLogout = () => {
	showLogoutConfirm.value = false
}

// 修改创建群聊的方法
const createGroupChat = async () => {
	showUnsolved.value = true

}

// 添加存储所有用户名缓存
const userNames = ref<{ [key: string]: string }>({})

// 添加用户信息的接口定
interface UserInfo {
	name: string;
	account: string;
	avatar?: string;
}

// 修改缓存类型定义
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

	async executeBatch() {
		if (this.batchQueue.size === 0) return;

		const accounts = Array.from(this.batchQueue);
		this.batchQueue.clear();

		try {
			const response = await fetch(`${getServerConfig().HOST}/site/imapi?s=/kefu/get`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					accounts: accounts
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

					const pending = this.pendingRequests.get(uid);
					if (pending) {
						this.pendingRequests.delete(uid);
					}
					userNames.value[uid] = userInfo.name;
				});
			}
		} catch (error) {
			console.error('批量获取用户息失败:', error);
		}
	}
};






// 添加修改用户名称的响应式变量
const showEditNameDialog = ref(false)
const editingName = ref('')

// 修改 showEditName 方法
const showEditName = async () => {
	try {
		// 先从存中获取
		if (userNames.value[uid.value]) {
			editingName.value = userNames.value[uid.value];
		}

		// 无论是否有缓存都重新获取一次最新的用户信息
		const response = await fetch(`${getServerConfig().HOST}/site/imapi?s=/kefu/get`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				accounts: [uid.value]
			})
		});

		const result = await response.json();
		if (result.success && result.data && result.data[uid.value]) {
			const userInfo = result.data[uid.value];
			// 更新编辑框中的名称
			editingName.value = userInfo.name;
			// 更新头像
			selectedAvatar.value = userInfo.avatar || defaultAvatars.value[0];
			// 同时更新缓存
			userNames.value[uid.value] = userInfo.name;
			userAvatars.value[uid.value] = userInfo.avatar || defaultAvatars.value[0];
		} else {
			// 如果获取失败，至少显示当前用户ID
			editingName.value = uid.value;
			selectedAvatar.value = defaultAvatars.value[0];
		}

		showEditNameDialog.value = true;

	} catch (error) {
		console.error('获取用户信息失败:', error);
		// 发生错误时也要显示一些默认值
		editingName.value = uid.value;
		selectedAvatar.value = defaultAvatars.value[0];
		showEditNameDialog.value = true;
	}
}



// 添加头像相关的响应式变量
const selectedAvatar = ref('')
const defaultAvatars = ref([
	// 这里添加10个预��头像的URL
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/98.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/1.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/5.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/9.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/10.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/11.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/12.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/13.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/14.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/15.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/16.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/17.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/18.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/19.png',
	'http://kefu.coolsaas.com.cn:8093/static/img/avatar/4.png',

	// ... 更多预设头像
])

// 选择预设头像
const selectAvatar = (avatar: string) => {
	selectedAvatar.value = avatar
}

// 处理自定义头像上传成功
const handleAvatarSuccess = (response: any) => {
	if (response.url) {
		const config = getServerConfig()
		selectedAvatar.value = `${config.UPLOAD_SERVER}${response.url}`
	}
}

// 修改 saveUserInfo 方法
const saveUserInfo = async () => {
	if (!editingName.value.trim()) {
		ElMessage.error('请输入您的名字');
		return;
	}

	try {
		const response = await fetch(`${getServerConfig().HOST}/site/imapi?s=/kefu/update`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				account: uid.value,
				name: editingName.value.trim(),
				avatar: selectedAvatar.value
			})
		});

		const result = await response.json();
		if (result.success) {
			// 更新本地缓存
			userNames.value[uid.value] = editingName.value.trim();
			userAvatars.value[uid.value] = selectedAvatar.value;
			showEditNameDialog.value = false;

			// 重置编辑状态
			editingName.value = userNames.value[uid.value] || uid.value;
			selectedAvatar.value = userAvatars.value[uid.value];

			// 触发自定义事件来更新 Conversation 组件
			document.dispatchEvent(new CustomEvent('userNameUpdated', {
				detail: {
					name: editingName.value.trim(),
					avatar: selectedAvatar.value
				}
			}));

			ElMessage({
				message: '保存成功！',
				type: 'success'
			});
		} else {
			ElMessage.error(result.message || '保存失败');
		}
	} catch (error) {
		console.error('更新用户信息时发生错误:', error);
		ElMessage.error('保存失败，请检查网络连接');
	}
}

// 取消编辑
const cancelEdit = () => {
	// 检查是否有用户名
	const hasUsername = userNames.value[uid.value] || editingName.value.trim();
	
	// 如果没有用户名，显示提示并阻止关闭
	if (!hasUsername) {
		ElMessage({
			message: '请设置您的名字，方便客服回复！',
			type: 'warning'
		});
		return;
	}
	
	showEditNameDialog.value = false;
	selectedAvatar.value = ''; // 清空选择的头像
}

// 添加用户头像缓存
const userAvatars = ref<{ [key: string]: string }>({})

// 在顶部添加图标定义
const icons = {
	bars: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M0 96C0 78.3 14.3 64 32 64H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32s14.3-32 32-32H416c17.7 0 32 14.3 32 32z"/></svg>`,

	paperPlane: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 427.7l-68.5 74.1c-8.9 9.7-22.9 12.9-35.2 8.1S160 493.2 160 480V396.4c0-4 1.5-7.8 4.2-10.7L331.8 202.8c5.8-6.3 5.6-16-.4-22s-15.7-6.4-22-.7L106 360.8 17.7 316.6C7.1 311.3 .3 300.7 0 288.9s5.9-22.8 16.1-28.7l448-256c10.7-6.1 23.9-5.5 34 1.4z"/></svg>`,

	image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 96C0 60.7 28.7 32 64 32H448c35.3 0 64 28.7 64 64V416c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96zM323.8 202.5c-4.5-6.6-11.9-10.5-19.8-10.5s-15.4 3.9-19.8 10.5l-87 127.6L170.7 297c-4.6-5.7-11.5-9-18.7-9s-14.2 3.3-18.7 9l-64 80c-5.8 7.2-6.9 17.1-2.9 25.4s12.4 13.6 21.6 13.6h336c8.9 0 17.1-4.9 21.2-12.8s3.6-17.4-1.4-24.7l-120-176zM112 192a48 48 0 1 0 0-96 48 48 0 1 0 0 96z"/></svg>`,

	rightFromBracket: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z"/></svg>`,

	plus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32V224H48c-17.7 0-32 14.3-32 32s14.3 32 32 32H192V432c0 17.7 14.3 32 32 32s32-14.3 32-32V288H400c17.7 0 32-14.3 32-32s-14.3-32-32-32H256V80z"/></svg>`,

	// 添加退出登录图标
	logout: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z"/></svg>`
}

// 添加渲染SVG的方法
const renderIcon = (name: keyof typeof icons) => {
	return { __html: icons[name] }
}

// 在 script setup 中添加新的响应式变量
const showUnsolved = ref(false)
const problemReport = ref({
	messageId: '',
	problem: '',
	description: ''
})

// 添加处理未解决问题的方法
const handleUnsolvedClick = (messageId: string) => {
	problemReport.value = {
		messageId,
		problem: '',
		description: ''
	}
	showUnsolved.value = true
}

// 修改 submitProblem 方法
const submitProblem = async () => {
	if (!problemReport.value.description.trim()) {
		ElMessage({
			message: '请输入问题描述',
			type: 'warning'
		})
		return;
	}

	try {
		const robot = localStorage.getItem('robot') || '';
		const scope = localStorage.getItem('scope') || '';

		console.log(robot, scope)
		const response = await fetch(`${getServerConfig().HOST}/site/add-unsolved-ques`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				ques: problemReport.value.description.trim(),
				uid: uid.value,
				robot: robot,
				scope: scope,
				kf: ''
			})
		});

		const result = await response.json();
		if (result.success) {
			showUnsolved.value = false;
			problemReport.value.description = '';

			ElMessage({
				message: '问题已提交，我们会尽快处理！',
				type: 'success'
			});
		} else {
			ElMessage({
				message: result.message || '提交失败，请稍后重试',
				type: 'error'
			});
		}
	} catch (error) {
		console.error('提交问题报告失败:', error);
		ElMessage({
			message: '提交失败，请检查网络连接',
			type: 'error'
		});
	}
};

// 添加客服列表的响应式变量
interface KefuInfo {
	account: string;
	name: string;
	avatar?: string;
}

const kefuList = ref<KefuInfo[]>([])
const showAtPanel = ref(false)

// 修改获取客服列表的方法
const getKefuList = async (groupId?: string) => {
	const scope = localStorage.getItem('scope') || '';
	try {
		const response = await fetch(`${getServerConfig().HOST}/site/imapi?s=/kefu/list`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				code: groupId || '' // 添加群ID参数
			})
		});
		const result = await response.json();
		console.log(result)
		if (result.success && result.data) {
			// 过滤掉当前用户自己
			kefuList.value = result.data.filter((kefu: KefuInfo) => kefu.account !== uid.value);
		}
	} catch (error) {
		console.error('获取客服列表失败:', error);
	}
}

// 添加自动调整高度的方法
const adjustTextareaHeight = (event: Event) => {
	const textarea = event.target as HTMLTextAreaElement;
	textarea.style.height = 'auto';
	textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
}

// 修改处理输入的方法
const handleInput = (e: Event) => {
	// 调整高度
	adjustTextareaHeight(e);

	const textarea = e.target as HTMLTextAreaElement;
	const value = textarea.value;
	const cursorPosition = textarea.selectionStart || 0;

	// 获取光标前的文本
	const textBeforeCursor = value.substring(0, cursorPosition);

	// 只有在群聊中才允许@功能
	if (to.value.channelType === ChannelTypeGroup) {
		// 检查是否刚输入了@符号
		if (textBeforeCursor.endsWith('@')) {
			showAtPanel.value = true;
			if (kefuList.value.length === 0) {
				getKefuList(to.value.channelID);
			}
		} else {
			const atIndex = textBeforeCursor.lastIndexOf('@');
			if (atIndex === -1) {
				showAtPanel.value = false;
			}
		}
	}
}

// 修改插入@用户名的方法
const insertAt = (name: string) => {
	const input = document.querySelector('.message-input') as HTMLInputElement
	if (!input) return

	const cursorPosition = input.selectionStart || 0
	const textBeforeCursor = text.value.substring(0, cursorPosition)
	const textAfterCursor = text.value.substring(cursorPosition)

	// 找到最后一个@的位置
	const lastAtIndex = textBeforeCursor.lastIndexOf('@')
	if (lastAtIndex !== -1) {
		// 替换@后面的文本
		text.value = textBeforeCursor.substring(0, lastAtIndex) +
			`@${name} ` +
			textAfterCursor

		// 将光标移动到插入的文本后面
		nextTick(() => {
			const newPosition = lastAtIndex + name.length + 2 // @+名字+空格
			input.setSelectionRange(newPosition, newPosition)
			input.focus()
		})
	}
	showAtPanel.value = false
}
</script>
<template>
	<view class="pop_box" v-if="show" v-on:click="close">
		<div :round="10" mode="top" :closeOnClickOverlay='true' :closeable="true" :show="show" @close="close">
			<view class="answer_popup__content">
				<div class="answer" v-html="richContent" @click.stop=""></div>
			</view>
		</div>
	</view>
	<!-- <v-icon icon="mdi-home" /> -->
	<!-- <quill-editor v-model="text"></quill-editor> -->
	<div class="chat">
		<div class="content">
			<!-- 添加遮罩层 -->
			<div class="mobile-mask" v-if="!isCollapse" @click="showConverClick"></div>
			<div class="conversation-box" :class="{ 'collapsed': isCollapse }">
				<Conversation :key="comKey" :onSelectChannel="onSelectChannel" :userName="uid" :selectedChannel="to"
					v-model:isCollapse="isCollapse" @editName="showEditName"></Conversation>
				<div class="bottom">
					<button v-on:click="showLogoutDialog">
						<span class="icon" v-html="icons.logout"></span>
						<span v-if="!isCollapse">退出登录</span>
					</button>
				</div>
			</div>
			<div class="message-box">
				<div class="header">
					<div class="left">
						<button class="menu-btn" v-on:click="showConverClick">
							<span class="icon" v-html="icons.bars"></span>
						</button>
						<!-- 添加点击事件 -->
						<div class="title">
							{{ to.channelID.length == 0 ? '选择联系人' :
								to.channelType == ChannelTypeGroup
									? (kefuName || to.channelID)
									: (kefuName || to.channelID) }}
						</div>
					</div>
					<!-- <button v-on:click="settingClick">{{ to.channelID.length == 0 ? '与谁会话？' : `${to.channelType ==
                    ChannelTypeGroup ? '群' : '单聊'}${to.channelID}` }}</button>
					 -->
				</div>
				<div class="message-list" v-on:scroll="handleScroll" ref="chatRef">
					<template v-for="m in messages">
						<div class="message right" v-if="m.send" :id="m.clientMsgNo">
							<div class="status" v-if="m.status != MessageStatus.Normal">发送中</div>
							<div class="bubble right bagright">
								<div class="text" v-html="getMessageText(m)" v-if="getMessageType(m) == 1"></div>
								<div class="text" v-if="getMessageType(m) == 2">
									<div v-for="(v, k) in getMessageText(m)">
										<a href="javaScript:void(0);" v-on:click="showAnswer(v.content, v.keyword)">{{ k
											+ 1 }}:{{ v.keyword }}</a>
									</div>
								</div>
								<div class="text" v-if="getMessageType(m) == 3">
									<div>
										{{ getMessageText(m).q }}
									</div>
								</div>
							</div>
							<div class="avatar">
								<img :src="userAvatars[m.fromUID]" />
							</div>
							<!-- 添加未解决按钮 -->

						</div>
						<div class="message left" v-if="!m.send" :id="m.clientMsgNo">
							<div class="sender-name">{{ userNames[m.fromUID] || m.fromUID }}</div>
							<div class="avatar">
								<img :src="userAvatars[m.fromUID]" />
							</div>
							<div class="bubble">
								<div class="text" v-html="getMessageText(m)" v-if="getMessageType(m) == 1"></div>
								<div class="text" v-if="getMessageType(m) == 2">
									<div v-for="(v, k) in getMessageText(m)">
										<a href="javaScript:void(0);" v-on:click="showAnswer(v.content, v.keyword)">{{ k
											+ 1 }}:{{ v.keyword }}</a>
									</div>
								</div>
								<div class="text" v-if="getMessageType(m) == 3">
									<div>
										{{ getMessageText(m).from_uid }},提问：{{ getMessageText(m).q }},未匹配到答案
										<a :class="m.remoteExtra.extra == '' ? 't-red' : ''" href="javascript:void(0);"
											v-on:click="sendAnswerBox(m)">回</a>
										<text v-if="m.remoteExtra.extra != ''">({{ m.remoteExtra.extra.kf }}已回复{{
											m.remoteExtra.extra.id }})</text>
									</div>
								</div>
							</div>
							<!-- 添加未解决按钮 -->
							<div v-if="getMessageType(m) == 2" class="unsolved-btn"
								@click="handleUnsolvedClick(m.clientMsgNo)">
								未解决?
							</div>
						</div>
					</template>
				</div>
				<div class="footer">
					<div class="input-wrapper">
						<div class="at-panel" v-if="showAtPanel">
							<div class="at-item" v-for="kefu in kefuList" :key="kefu.account" 
								@click="insertAt(kefu.name || kefu.account)">
								<img :src="userAvatars[kefu.account] || defaultAvatars[0]" class="at-avatar" />
								<span>{{ kefu.name || kefu.account }}</span>
							</div>
						</div>
						<textarea 
							:placeholder="msgInputPlaceholder" 
							v-model="text" 
							class="message-input"
							@keydown.enter.prevent="onEnter"
							@input="handleInput"
							rows="1"
						></textarea>

						<div class="action-buttons">
							<el-upload v-model:file-list="fileList" class="upload-demo" name="upfile"
								:show-file-list="false"
								:action="`${getServerConfig().UPLOAD_SERVER}/controller.php?action=uploadimage`"
								:on-change="handleChange">
								<button class="action-btn">
									<span class="icon" v-html="icons.image"></span>
								</button>
							</el-upload>
							<button class="action-btn send-btn" @click="onSend">
								<span class="icon" v-html="icons.paperPlane"></span>
								发送
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<transition name="fade">
		<div class="setting" v-if="showSendBox">
			<div class="setting-content" @click.stop="">
				<vue-ueditor-wrap :config="uecfg" v-model="sendData.q" @keydown.enter="onEnter"></vue-ueditor-wrap>
				<view class="box-center"><button class="ok" v-on:click="sendOKClick(0)">取消</button></view>
				<view class="box-center"><button class="ok" v-on:click="sendOKClick(1)">确定</button></view>
			</div>
		</div>
	</transition>
	<!-- 添加图片预览组 -->
	<div class="image-preview" v-if="previewImage" @click="closePreview">
		<img :src="previewImage" @click.stop>
	</div>
	<transition name="fade">
		<div class="setting" v-if="showLogoutConfirm">
			<div class="setting-content logout-confirm">
				<h3>确认退出</h3>
				<p>您确定要退出登录吗？</p>
				<div class="logout-buttons">
					<button class="cancel-btn" @click="cancelLogout">取消</button>
					<button class="confirm-btn" @click="confirmLogout">确定</button>
				</div>
			</div>
		</div>
	</transition>
	<!-- 添加修改名称的弹窗 -->
	<transition name="fade">
		<div class="setting" v-if="showEditNameDialog">
			<div class="setting-content edit-profile-dialog">
				<h3>修改个人信息</h3>

				<!-- 头像选择区域 -->
				<div class="avatar-selector">
					<div class="current-avatar">
						<img :src="selectedAvatar" alt="当前头像">
					</div>
					<div class="avatar-list">
						<!-- 预设头像选项 -->
						<div v-for="(avatar, index) in defaultAvatars" :key="index" class="avatar-option"
							:class="{ selected: selectedAvatar === avatar }" @click="selectAvatar(avatar)">
							<img :src="avatar" :alt="`头像${index + 1}`">
						</div>

						<!-- 自定义上传按钮 -->
						<!-- <el-upload
							class="custom-upload"
							:show-file-list="false"
							:action="`${getServerConfig().UPLOAD_SERVER}/controller.php?action=uploadimage`"
							:on-success="handleAvatarSuccess"
						>
							<i class="fas fa-plus"></i>
						</el-upload> -->
					</div>
				</div>

				<!-- 名称输入框 -->
				<div class="input-group">
					<label>名称：</label>
					<input type="text" v-model="editingName" placeholder="输入你的名字方便客服回复哦！" @keyup.enter="saveUserInfo" />
				</div>

				<!-- 按钮组 -->
				<div class="button-group">
					<button class="cancel-btn" @click="cancelEdit">取消</button>
					<button class="confirm-btn" @click="saveUserInfo">保存</button>
				</div>
			</div>
		</div>
	</transition>
	<!-- 添加未解决问题弹窗 -->
	<transition name="fade">
		<div class="setting" v-if="showUnsolved">
			<div class="setting-content problem-dialog">
				<h3>提交问题</h3>
				<div class="input-group">
					<textarea v-model="problemReport.description" placeholder="请详细描述您遇到的问题，请留意信息稍后客服回复您。"
						rows="4"></textarea>
				</div>

				<div class="button-group">
					<button class="cancel-btn" @click="showUnsolved = false">取消</button>
					<button class="confirm-btn" @click="submitProblem">提交</button>
				</div>
			</div>
		</div>
	</transition>
</template>
<style>
@import '../styles/chat.css';
</style>
