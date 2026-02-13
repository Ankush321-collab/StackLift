#!/bin/bash

set -e

if [ -f "/home/app/.env" ]; then
	set -a
	# shellcheck disable=SC1091
	. /home/app/.env
	set +a
fi

if [ -n "$GIT_REPO_URL" ]; then
	GIT_REPOSITORY="$GIT_REPO_URL"
fi

if [ -z "$GIT_REPOSITORY" ]; then
	echo "GIT_REPOSITORY or GIT_REPO_URL is not set" >&2
	exit 1
fi

export GIT_REPOSITORY="$GIT_REPOSITORY"

git clone "$GIT_REPOSITORY" /home/app/output

exec node script.js