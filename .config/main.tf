terraform {
  required_version = ">= 1.5"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "resource_group_name" {
  description = "Name of the existing resource group"
  type        = string
  default     = "rg-releases"
}

variable "container_image" {
  description = "Full container image reference"
  type        = string
  default     = "ghcr.io/cpistohl/flavor-finder:latest"
}

variable "ghcr_username" {
  description = "GitHub Container Registry username"
  type        = string
  default     = "cpistohl"
}

variable "ghcr_password" {
  description = "GHCR PAT with read:packages scope"
  type        = string
  sensitive   = true
}

data "azurerm_resource_group" "main" {
  name = var.resource_group_name
}

data "azurerm_container_app_environment" "main" {
  name                = "cae-releases"
  resource_group_name = data.azurerm_resource_group.main.name
}

resource "azurerm_container_app" "flavor_finder" {
  name                         = "flavor-finder"
  container_app_environment_id = data.azurerm_container_app_environment.main.id
  resource_group_name          = data.azurerm_resource_group.main.name
  revision_mode                = "Single"

  secret {
    name  = "ghcr-password"
    value = var.ghcr_password
  }

  registry {
    server               = "ghcr.io"
    username             = var.ghcr_username
    password_secret_name = "ghcr-password"
  }

  ingress {
    external_enabled = true
    target_port      = 8080

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    container {
      name   = "flavor-finder"
      image  = var.container_image
      cpu    = 0.25
      memory = "0.5Gi"
    }

    min_replicas = 0
    max_replicas = 1
  }
}

output "app_url" {
  value = "https://${azurerm_container_app.flavor_finder.ingress[0].fqdn}"
}
