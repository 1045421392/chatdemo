import { RouteRecordRaw } from 'vue-router';
const chat = () => import('../view/Chat.vue')
const login = () => import('../view/Login.vue')
const routes:Array<RouteRecordRaw> = [
    {
        path: '/chat',
        component: chat,
    },
	{
	    path: '/login',
	    component: login,
	},
	{
        path: '/',
        component: chat,
    },
]
export default routes;

