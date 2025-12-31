<script setup lang="ts">
// AUTH REMOVED: Signout now just redirects to homepage
import { VIEWS } from '@/app/constants';
import { useRouter } from 'vue-router';
import { onMounted } from 'vue';

const router = useRouter();

onMounted(() => {
	// Redirect to homepage since auth is disabled
	void router.push({ name: VIEWS.HOMEPAGE });
});
</script>

<template>
	<div />
</template>
