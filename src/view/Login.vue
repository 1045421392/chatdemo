<script setup lang="ts">
	import { ref, onMounted } from 'vue'
	import APIClient from '../services/APIClient'
	import { useRouter } from "vue-router";
	import { WKSDK } from 'wukongimjssdk';
	import Toast from '../components/Toast/index.vue'
	import { getServerConfig } from '../config'

	const router = useRouter();
	const toastRef = ref()

	const count = ref(0)
	const username = ref('')
	const password = ref('')
	const code = ref('')
	const loginType = ref('')
	const phone = ref('')

	const config = getServerConfig()
	APIClient.shared.config.apiURL = `${config.HOST}/site/imapi?s=/`

	const icons = {
		user: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512H418.3c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304H178.3z"/></svg>`,
		lock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M144 144v48H304V144c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192V144C80 64.5 144.5 0 224 0s144 64.5 144 144v48h16c35.3 0 64 28.7 64 64V448c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V256c0-35.3 28.7-64 64-64H80z"/></svg>`,
		key: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M336 352c97.2 0 176-78.8 176-176S433.2 0 336 0S160 78.8 160 176c0 18.7 2.9 36.8 8.3 53.7L7 391c-4.5 4.5-7 10.6-7 17v80c0 13.3 10.7 24 24 24h80c13.3 0 24-10.7 24-24V448h40c13.3 0 24-10.7 24-24V384h40c6.4 0 12.5-2.5 17-7l33.3-33.3c16.9 5.4 35 8.3 53.7 8.3zM376 96a40 40 0 1 1 0 80 40 40 0 1 1 0-80z"/></svg>`
	}

	const login = () => {
		// 账号密码登录时的验证
		if (loginType.value === 'a') {
			if (!username.value) {
				toastRef.value.show('请输入账号')
				return
			}
			if (!password.value) {
				toastRef.value.show('请输入密码')
				return
			}
		}
		// 手机号登录时的验证 
		else {
			if (!/^1[3-9]\d{9}$/.test(phone.value)) {
				toastRef.value.show('请输入正确的手机号')
				return
			}
		}

		localStorage.setItem('username', loginType.value === 'a' ? username.value : phone.value)
		localStorage.setItem('password', password.value)

		const loginData = loginType.value === 'a' ? {
			uid: username.value,
			token: password.value || "default111111",
			device_flag: 1,
			device_level: 0,
			loginType: loginType.value
		} : {
			uid: phone.value,
			code: code.value,
			token: password.value || "default111111",
			device_flag: 1,
			device_level: 0,
			loginType: loginType.value
		}
		console.log(loginData)
		APIClient.shared.post('/user/token', loginData)
			.then((res) => {
				console.log(res, res.message)

				if (res.status == -1) {
					toastRef.value.show(res.message)
					return
				}
				try {
					if (res.supcust) {
						localStorage.setItem('robot', res.supcust.chat_account) //group
						localStorage.setItem('scope', res.user.scope) //group
						localStorage.setItem('groupcode', res.user.groupcode) //邀请码
					}
					localStorage.setItem('role', res.user.is_kefu) //角色
					// 检查用户昵称
					if (res.user && (!res.user.nickname || res.user.nickname.trim() === '')) {
						// 设置标记，表示需要修改名称
						localStorage.setItem('needUpdateName', 'true')
					} else if (res.user && res.user.nickname) {
						// 保存用户昵称
						localStorage.setItem('nickname', res.user.nickname)
					}

					router.push({ path: '/chat', query: {} })
				} catch (e) {
					toastRef.value.show('数据错误')
					return;
				}
			}).catch((err) => {
				toastRef.value.show(err.toString())
			})

		// 保存登录类型
		localStorage.setItem('loginType', loginType.value)
	}

	const autoLogin = () => {
		const savedUsername = localStorage.getItem('username')
		const savedPassword = localStorage.getItem('password')
		if (savedUsername && savedPassword) {
			username.value = savedUsername
			password.value = savedPassword
			login()
		}
	}

	onMounted(() => {
		const route = useRouter().currentRoute.value
		// 从路由参数或localStorage获取登录类型
		loginType.value = route.query.type?.toString() || localStorage.getItem('loginType') || 'a'
		
		// 保存登录类型
		localStorage.setItem('loginType', loginType.value)
		
		autoLogin()
	})
</script>
<template>
	<Toast ref="toastRef" />
	<div class="page flex-col">
		<div class="box_1 flex-col">
			<div class="group_3 flex-row">
				<img class="image_2" referrerpolicy="no-referrer"
					src="/src/assets/193.png" />
				<span class="text_2">欢迎使用AI智能客服</span>
			</div>
			<div class="block_2 flex-col">
				<template v-if="loginType === 'a'">
					<div class="box_2">
						<div class="image-text_3">
							<span class="icon-wrapper" v-html="icons.user"></span>
							<span class="text_3">账号</span>
						</div>
						<input type="text" class="login-input" placeholder="输入客服账号" v-model="username" />
					</div>
					<div class="box_2">
						<div class="image-text_3">
							<span class="icon-wrapper" v-html="icons.lock"></span>
							<span class="text_3">密码</span>
						</div>
						<input type="password" class="login-input" placeholder="输入密码" v-model="password" />
					</div>
				</template>

				<template v-else>
					<div class="box_2">
						<div class="image-text_3">
							<span class="icon-wrapper" v-html="icons.user"></span>
							<span class="text_3">手机号</span>
						</div>
						<input type="tel" class="login-input" placeholder="请输入手机号" v-model="phone" />
					</div>
					<!-- <div class="box_2">
						<div class="image-text_3">
							<span class="icon-wrapper" v-html="icons.lock"></span>
							<span class="text_3">密码</span>
						</div>
						<input type="password" class="login-input" placeholder="输入密码" v-model="password" />
					</div> -->
					<div class="box_2">
						<div class="image-text_3">
							<span class="icon-wrapper" v-html="icons.key"></span>
							<span class="text_3">邀请码</span>
						</div>
						<input type="text" class="login-input" placeholder="请输入邀请码(新账号必填)" v-model="code" required />
					</div>
				</template>

				<div class="box_4">
					<div class="text-wrapper flex-col">
						<button class="login-btn" v-on:click="login">登录</button>
					</div>
				</div>
			</div>
		</div>
	</div>
	
</template>

<style>
@import '../styles/login.css';
</style>