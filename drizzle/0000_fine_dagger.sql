CREATE TABLE `contact_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`status` enum('new','read','responded') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exclusive_content` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`content` text,
	`type` enum('video','tutorial','article','resource','tool') NOT NULL,
	`minTierRequired` varchar(64) NOT NULL,
	`published` boolean NOT NULL DEFAULT false,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exclusive_content_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supporter_access_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supporterId` int NOT NULL,
	`contentId` int NOT NULL,
	`accessedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supporter_access_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supporter_tiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`displayName` varchar(128) NOT NULL,
	`monthlyPrice` decimal(10,2) NOT NULL,
	`description` text,
	`features` text,
	`order` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supporter_tiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supporters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`kofiEmail` varchar(320) NOT NULL,
	`tierId` int NOT NULL,
	`tierName` varchar(64) NOT NULL,
	`kofiId` varchar(255),
	`status` enum('active','paused','cancelled') NOT NULL DEFAULT 'active',
	`monthlyAmount` decimal(10,2),
	`subscribedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supporters_id` PRIMARY KEY(`id`),
	CONSTRAINT `supporters_kofiEmail_unique` UNIQUE(`kofiEmail`)
);
--> statement-breakpoint
CREATE TABLE `tool_usage_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`toolName` varchar(128) NOT NULL,
	`query` text,
	`resultSummary` text,
	`executionTimeMs` int,
	`success` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tool_usage_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
