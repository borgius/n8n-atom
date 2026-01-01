<script lang="ts" setup>
import { computed } from 'vue';
import { RouterLink, useRouter, type RouteLocationRaw } from 'vue-router';

interface RouteProps {
	to?: RouteLocationRaw | string;
	newWindow?: boolean;
	title?: string;
	dataTestId?: string;
}

defineOptions({ name: 'N8nRoute' });
const props = defineProps<RouteProps>();

const router = useRouter();

// Detect if we're in a VS Code webview environment
// In webview, window.BASE_PATH is set to empty string and location.origin starts with vscode-webview
const isVSCodeWebview = computed(() => {
	if (typeof window === 'undefined') return false;
	const basePath = (window as unknown as { BASE_PATH?: string }).BASE_PATH;
	return basePath === '' || window.location.origin.includes('vscode-webview');
});

const useRouterLink = computed(() => {
	// In VS Code webview, don't use RouterLink as it generates href that causes new tab opens
	if (isVSCodeWebview.value) {
		return false;
	}

	if (props.newWindow) {
		// router-link does not support click events and opening in new window
		return false;
	}

	if (typeof props.to === 'string') {
		return props.to.startsWith('/');
	}

	return props.to !== undefined;
});

const openNewWindow = computed(() => !useRouterLink.value && props.newWindow);

// Handle clicks in VS Code webview environment
const handleClick = (event: MouseEvent) => {
	if (!isVSCodeWebview.value || !props.to) return;

	event.preventDefault();
	event.stopPropagation();

	// Use Vue Router to navigate
	void router.push(props.to);
};

// Check if this should be rendered as a clickable element (for VS Code webview)
const isClickable = computed(() => {
	return isVSCodeWebview.value && props.to && !props.newWindow;
});
</script>

<template>
	<RouterLink
		v-if="useRouterLink && to"
		:to="to"
		role="link"
		v-bind="$attrs"
		:data-test-id="dataTestId"
	>
		<slot></slot>
	</RouterLink>
	<span
		v-else-if="isClickable"
		role="link"
		tabindex="0"
		v-bind="$attrs"
		:title="title"
		:data-test-id="dataTestId"
		:style="{ cursor: 'pointer' }"
		@click="handleClick"
		@keydown.enter="handleClick"
	>
		<slot></slot>
	</span>
	<a
		v-else
		:href="to ? `${to}` : undefined"
		:target="openNewWindow ? '_blank' : '_self'"
		v-bind="$attrs"
		:title="title"
		:data-test-id="dataTestId"
	>
		<slot></slot>
	</a>
</template>
