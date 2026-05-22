CREATE TABLE `email_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notificationId` int NOT NULL,
	`recipientEmail` varchar(320) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`htmlBody` text NOT NULL,
	`status` enum('pending','sent','failed','bounced') NOT NULL DEFAULT 'pending',
	`attemptCount` int NOT NULL DEFAULT 0,
	`lastAttemptAt` timestamp,
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	CONSTRAINT `email_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`emailEnabled` boolean NOT NULL DEFAULT true,
	`pushEnabled` boolean NOT NULL DEFAULT true,
	`inAppEnabled` boolean NOT NULL DEFAULT true,
	`categoryPreferences` text NOT NULL DEFAULT ('{}'),
	`emailFrequency` enum('immediate','daily','weekly','never') NOT NULL DEFAULT 'daily',
	`quietHoursStart` varchar(5),
	`quietHoursEnd` varchar(5),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_preferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`type` enum('success','error','warning','info') NOT NULL DEFAULT 'info',
	`category` varchar(64) NOT NULL,
	`source` enum('system','admin','user','realtime') NOT NULL DEFAULT 'system',
	`channels` varchar(255) NOT NULL DEFAULT 'in-app',
	`inAppStatus` enum('pending','sent','read','dismissed') NOT NULL DEFAULT 'pending',
	`emailStatus` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'skipped',
	`pushStatus` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'skipped',
	`displayLocation` varchar(64) NOT NULL DEFAULT 'toast',
	`duration` int,
	`actionUrl` varchar(512),
	`actionLabel` varchar(64),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	`readAt` timestamp,
	`dismissedAt` timestamp,
	`expiresAt` timestamp,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`endpoint` varchar(512) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`userAgent` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_subscriptions_endpoint_unique` UNIQUE(`endpoint`)
);
