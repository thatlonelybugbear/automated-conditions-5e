export function getActivityBaseType(activity) {
	return activity?.metadata?.like ?? CONFIG.DND5E.activityTypes[activity?.type]?.documentClass?.metadata?.like ?? activity?.type ?? '';
}
