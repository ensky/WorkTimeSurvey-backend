DOCKER = docker exec worktimesurveybackend_node_1

all:

.PHONY: test
test:
	$(DOCKER) npm test
